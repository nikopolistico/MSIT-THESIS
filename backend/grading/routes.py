"""The HTTP API under /api."""

import io
import json
from urllib.parse import quote

from fastapi import APIRouter, File, HTTPException, UploadFile
from PIL import Image
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

from . import store
from .config import CLASSES, DEPLOY, MAX_UPLOAD, cfg
from .model import infer
from .references import REF_ROWS
from .scoring import summary
from .service import detail, fruit_detail

router = APIRouter(prefix="/api")


class Feedback(BaseModel):
    maturityLabel: str
    qualityLabel: str
    note: str | None = None


@router.get("/health")
def health():
    """For the hosting platform's health check."""
    return {"ok": True, "model": cfg["model_file"], "references": len(REF_ROWS)}


@router.get("/queue")
def queue(limit: int = 20, offset: int = 0):
    with store.lock:
        store.scan_pool()
        ids = store.pending_ids()[offset : offset + limit]
        return [summary(i, store.state["items"][i], f"/media/{quote(i)}") for i in ids]


@router.get("/items/{item_id}")
def get_item(item_id: str):
    with store.lock:
        rec = store.state["items"].get(item_id)
        if rec is None:
            raise HTTPException(404, "Item not found")
        return detail(item_id, rec, f"/media/{quote(item_id)}")


@router.post("/items/{item_id}/feedback", status_code=204)
def feedback(item_id: str, body: Feedback):
    if body.maturityLabel not in CLASSES["maturity"] or body.qualityLabel not in CLASSES["quality"]:
        raise HTTPException(422, "Unknown label")
    with store.lock:
        rec = store.state["items"].get(item_id)
        if rec is None:
            raise HTTPException(404, "Item not found")
        store.add_decision(item_id, rec, body.maturityLabel, body.qualityLabel, body.note)


@router.post("/predict")
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
    with store.lock:
        return fruit_detail(views)


def load_evaluations() -> list[dict]:
    """The held-out test result written by evaluate.py, if it has been run."""
    path = DEPLOY / "evaluation.json"
    return [json.loads(path.read_text())] if path.exists() else []


@router.get("/metrics")
def metrics():
    with store.lock:
        ds = store.state["decisions"]
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


@router.get("/history")
def history():
    with store.lock:
        return [
            {k: v for k, v in d.items() if k != "emb"}
            for d in sorted(store.state["decisions"], key=lambda d: d["timestamp"], reverse=True)
        ]
