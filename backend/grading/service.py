"""Read models of one fruit: nearest neighbours, the full detail and the multi-side reading."""

from urllib.parse import quote

import numpy as np

from .config import REFERENCE
from .references import REF_BY_TASK, REF_FILES, REF_ROWS, REFS, ood_similarity
from .scoring import badness, summary
from .store import state


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


def detail(item_id: str, rec: dict, image_url: str) -> dict:
    emb = np.array(rec["emb"], dtype="float32")
    return {
        **summary(item_id, rec, image_url),
        "gradcamUrl": "",  # the ONNX model has no Grad-CAM output
        "oodSimilarity": ood_similarity(emb),
        "neighbors": neighbors(emb, item_id),
    }


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
