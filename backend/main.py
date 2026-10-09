"""Backend for the review UI: runs the ONNX model in model/deploy and stores expert feedback.

Run from this folder:  uvicorn main:app --port 8000
Images dropped into data/pool/ become the unlabeled review queue (scanned on every queue request).
"""

import io
import csv
import json
import os
import threading
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from urllib.parse import quote

import numpy as np
import onnxruntime as ort
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image, ImageOps
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

try:  # phone photos
    import pillow_heif

    pillow_heif.register_heif_opener()
except ImportError:
    pass

ROOT = Path(__file__).parent
DEPLOY = ROOT / "model" / "deploy"
# Expert decisions and the review pool live in DATA_DIR, so a deployed server can keep them on a
# persistent volume. The reference images ship with the code and stay next to it.
DATA = Path(os.getenv("DATA_DIR", ROOT / "data"))
POOL = DATA / "pool"
DB = DATA / "db.json"
REFERENCE = ROOT / "data" / "reference"  # filled by extract_reference.py
POOL.mkdir(parents=True, exist_ok=True)
REFERENCE.mkdir(parents=True, exist_ok=True)

cfg = json.loads((DEPLOY / "config.json").read_text())
CLASSES: dict[str, list[str]] = cfg["classes"]
TASKS = list(CLASSES)  # ["maturity", "quality"]
SIZE = cfg["input"]["size"]
MEAN = np.array(cfg["input"]["mean"], dtype="float32").reshape(3, 1, 1)
STD = np.array(cfg["input"]["std"], dtype="float32").reshape(3, 1, 1)
K = cfg["ood"]["k"]
REFS = np.load(DEPLOY / cfg["ood"]["reference_file"]).astype("float32")
# ref_embeddings.npy holds the embeddings of the train split, in splits.csv order (verified: nearest
# neighbors share labels). Each row has ONE label: from the maturity or the quality dataset.
REF_ROWS = [
    r for r in csv.DictReader(open(DEPLOY / "splits.csv", encoding="utf-8-sig")) if r["split"] == "train"
]
assert len(REF_ROWS) == len(REFS), "splits.csv train rows must match ref_embeddings.npy"
REF_FILES = [PurePosixPath(r["path"].replace("\\", "/")).name for r in REF_ROWS]
REF_BY_TASK = {t: np.array([i for i, r in enumerate(REF_ROWS) if r["task"] == t]) for t in CLASSES}
session = ort.InferenceSession(str(DEPLOY / cfg["model_file"]), providers=["CPUExecutionProvider"])

MAX_UPLOAD = 10 * 1024 * 1024
IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp", ".heic"}

# state["items"]: cached predictions of pool images. state["decisions"]: expert labels = kNN memory bank.
lock = threading.Lock()
state: dict = json.loads(DB.read_text()) if DB.exists() else {"items": {}, "decisions": []}


def save() -> None:
    tmp = DB.with_suffix(".tmp")
    tmp.write_text(json.dumps(state))
    tmp.replace(DB)


def infer(img: Image.Image) -> dict:
    img = ImageOps.exif_transpose(img).convert("RGB")
    w, h = img.size
    s = min(w, h)
    left, top = (w - s) // 2, (h - s) // 2
    img = img.crop((left, top, left + s, top + s)).resize((SIZE, SIZE), Image.BICUBIC)
    x = (np.asarray(img, dtype="float32") / 255.0).transpose(2, 0, 1)
    x = ((x - MEAN) / STD)[None]
    p_mat, p_qual, emb = session.run(None, {"image": x})
    emb = emb[0] / np.linalg.norm(emb[0])
    return {"maturity": p_mat[0].tolist(), "quality": p_qual[0].tolist(), "emb": emb.tolist()}


def ood_similarity(emb: np.ndarray) -> float:
    # shortcut: mean of the top-k cosine similarities to the reference set; config.json doesn't say
    # whether the cutoff was calibrated on mean or k-th similarity. Re-check against your training notebook.
    return float(np.sort(REFS @ emb)[-K:].mean())


def neighbors(emb: np.ndarray, exclude: str, k: int = 5) -> list[dict]:
    """Nearest k per task. A reference image has only its own dataset's label, so mixing the two
    datasets in one top-k would leave one task without neighbors."""
    found: dict[str, dict] = {}
    ref_sims = REFS @ emb
    for task, idx in REF_BY_TASK.items():
        for i in idx[np.argsort(-ref_sims[idx])[:k]]:
            name = REF_FILES[i]
            if not (REFERENCE / name).exists():  # extract_reference.py not run yet
                continue
            found[f"ref:{name}"] = {
                "id": f"ref:{name}",
                "imageUrl": f"/media/ref/{quote(name)}",
                "maturityLabel": REF_ROWS[i]["label"] if task == "maturity" else None,
                "qualityLabel": REF_ROWS[i]["label"] if task == "quality" else None,
                "similarity": float(ref_sims[i]),
            }
    bank = [d for d in state["decisions"] if d["itemId"] != exclude]
    if bank:  # expert-reviewed fruit carries both labels, so it serves both tasks
        sims = np.array([d["emb"] for d in bank], dtype="float32") @ emb
        for i in np.argsort(-sims)[:k]:
            found[bank[i]["itemId"]] = {
                "id": bank[i]["itemId"],
                "imageUrl": f"/media/{quote(bank[i]['itemId'])}",
                "maturityLabel": bank[i]["expertMaturity"],
                "qualityLabel": bank[i]["expertQuality"],
                "similarity": float(sims[i]),
            }
    return sorted(found.values(), key=lambda n: -n["similarity"])


def summary(item_id: str, rec: dict, image_url: str) -> dict:
    out: dict = {"id": item_id, "imageUrl": image_url, "entropy": 0.0}
    for t in TASKS:
        p = np.array(rec[t])
        i = int(p.argmax())
        out[t] = {"label": CLASSES[t][i], "confidence": float(p[i])}
        out["entropy"] += float(-(p * np.log(np.clip(p, 1e-12, 1))).sum())
    return out


def detail(item_id: str, rec: dict, image_url: str) -> dict:
    emb = np.array(rec["emb"], dtype="float32")
    return {
        **summary(item_id, rec, image_url),
        "gradcamUrl": "",  # the ONNX model has no Grad-CAM output
        "oodSimilarity": ood_similarity(emb),
        "neighbors": neighbors(emb, item_id),
    }


def scan_pool() -> None:
    changed = False
    for f in sorted(POOL.iterdir()):
        if f.suffix.lower() in IMAGE_EXT and f.name not in state["items"]:
            try:
                state["items"][f.name] = infer(Image.open(f))
                changed = True
            except Exception as e:  # unreadable file must not break the queue
                print(f"skipping {f.name}: {e}")
    if changed:
        save()


def pending_ids() -> list[str]:
    done = {d["itemId"] for d in state["decisions"]}
    ids = [i for i in state["items"] if i not in done and (POOL / i).exists()]
    return sorted(ids, key=lambda i: -summary(i, state["items"][i], "")["entropy"])


app = FastAPI(title="Dragon fruit review backend")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)
# Mount the more specific path first, or /media would swallow /media/ref.
app.mount("/media/ref", StaticFiles(directory=REFERENCE), name="reference")
app.mount("/media", StaticFiles(directory=POOL), name="media")


@app.get("/api/health")
def health():
    """For the hosting platform's health check."""
    return {"ok": True, "model": cfg["model_file"], "references": len(REF_ROWS)}


@app.get("/api/queue")
def queue(limit: int = 20, offset: int = 0):
    with lock:
        scan_pool()
        ids = pending_ids()[offset : offset + limit]
        return [summary(i, state["items"][i], f"/media/{quote(i)}") for i in ids]


@app.get("/api/items/{item_id}")
def get_item(item_id: str):
    with lock:
        rec = state["items"].get(item_id)
        if rec is None:
            raise HTTPException(404, "Item not found")
        return detail(item_id, rec, f"/media/{quote(item_id)}")


class Feedback(BaseModel):
    maturityLabel: str
    qualityLabel: str
    note: str | None = None


@app.post("/api/items/{item_id}/feedback", status_code=204)
def feedback(item_id: str, body: Feedback):
    if body.maturityLabel not in CLASSES["maturity"] or body.qualityLabel not in CLASSES["quality"]:
        raise HTTPException(422, "Unknown label")
    with lock:
        rec = state["items"].get(item_id)
        if rec is None:
            raise HTTPException(404, "Item not found")
        model = summary(item_id, rec, "")
        # Appending to decisions IS the "add to kNN memory bank immediately" step.
        state["decisions"].append(
            {
                "id": f"dec-{len(state['decisions']) + 1}",
                "itemId": item_id,
                "imageUrl": f"/media/{quote(item_id)}",
                "modelMaturity": model["maturity"]["label"],
                "modelQuality": model["quality"]["label"],
                "expertMaturity": body.maturityLabel,
                "expertQuality": body.qualityLabel,
                "note": body.note,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "emb": rec["emb"],
            }
        )
        save()


def badness(probs: list[float]) -> float:
    # shortcut: assumes labels in config.json go from best to worst (fresh, defective; or Extra, Class I,
    # Class II). Upgrade to an explicit "worst" list in config.json if that ever stops being true.
    return float(np.dot(np.array(probs), np.arange(len(probs))))


def fruit_detail(views: list[tuple[str, dict]]) -> dict:
    """One reading for a fruit photographed from one or more sides.

    Maturity averages the sides, since colour can differ front to back. Quality is decided by the
    worst side, since a defect on the back must not be hidden by a clean front.
    """
    combined = {
        "maturity": np.mean([r["maturity"] for _, r in views], axis=0).tolist(),
        "quality": max((r["quality"] for _, r in views), key=badness),
        "emb": views[0][1]["emb"],
    }
    out = {**summary("upload", combined, ""), "gradcamUrl": ""}  # the ONNX model has no Grad-CAM output
    out["neighbors"] = neighbors(np.array(views[0][1]["emb"], dtype="float32"), "upload")
    out["oodSimilarity"] = min(ood_similarity(np.array(r["emb"], dtype="float32")) for _, r in views)
    out["views"] = [
        {
            **{k: v for k, v in summary("upload", r, "").items() if k in ("maturity", "quality", "entropy")},
            "side": side,
            "oodSimilarity": ood_similarity(np.array(r["emb"], dtype="float32")),
            "neighbors": neighbors(np.array(r["emb"], dtype="float32"), "upload"),
        }
        for side, r in views
    ]
    return out


@app.post("/api/predict")
async def predict(image: UploadFile = File(...), back: UploadFile | None = File(None)):
    """`image` is the front of the fruit; `back` is optional. Stateless: nothing is stored."""
    views = []
    for side, upload in (("front", image), ("back", back)):
        if upload is None:
            continue
        data = await upload.read(MAX_UPLOAD + 1)
        if len(data) > MAX_UPLOAD:
            raise HTTPException(413, f"The {side} photo is larger than 10 MB")
        try:
            # Inference runs off the event loop so several farmers can be served at once.
            rec = await run_in_threadpool(lambda d=data: infer(Image.open(io.BytesIO(d))))
        except Exception:
            raise HTTPException(400, f"The {side} photo is not a readable image")
        views.append((side, rec))
    with lock:
        return fruit_detail(views)


def load_evaluations() -> list[dict]:
    """The held-out test result written by evaluate.py, if it has been run."""
    path = DEPLOY / "evaluation.json"
    return [json.loads(path.read_text())] if path.exists() else []


@app.get("/api/metrics")
def metrics():
    with lock:
        ds = state["decisions"]
        by_day: dict[str, list[int]] = {}
        for d in ds:
            row = by_day.setdefault(d["timestamp"][:10], [0, 0])
            row[0] += 1
            row[1] += (d["modelMaturity"], d["modelQuality"]) != (d["expertMaturity"], d["expertQuality"])
        return {
            "referenceCount": len(REF_ROWS),  # training images behind ref_embeddings.npy
            "labelCount": len(REF_ROWS) + len(ds),  # everything in the kNN memory bank
            "expertQueries": len(ds),
            "correctionsApplied": sum(r[1] for r in by_day.values()),
            "evaluations": load_evaluations(),
            "rounds": [{"round": day, "queries": q, "corrections": c} for day, (q, c) in sorted(by_day.items())],
            "lastConsolidation": None,  # no fine-tuning pipeline here
        }


@app.get("/api/history")
def history():
    with lock:
        return [
            {k: v for k, v in d.items() if k != "emb"}
            for d in sorted(state["decisions"], key=lambda d: d["timestamp"], reverse=True)
        ]


# The built frontend, so one server can serve the app and the API together (see the root Dockerfile).
# Keep this last: the catch-all route must not shadow the API routes above.
STATIC = Path(os.getenv("STATIC_DIR", ROOT / "static"))
if (STATIC / "index.html").is_file():
    if (STATIC / "assets").is_dir():
        app.mount("/assets", StaticFiles(directory=STATIC / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def frontend(path: str):
        if path.startswith(("api/", "media/")):
            raise HTTPException(404, "Not found")
        target = (STATIC / path).resolve()
        if path and target.is_file() and STATIC.resolve() in target.parents:
            return FileResponse(target)
        return FileResponse(STATIC / "index.html")  # a page route such as /inventory
