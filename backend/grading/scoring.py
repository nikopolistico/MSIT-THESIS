"""Turning raw probabilities into the labels, confidences and entropy the UI shows."""

import numpy as np

from .config import CLASSES, TASKS


def summary(item_id: str, rec: dict, image_url: str) -> dict:
    out: dict = {"id": item_id, "imageUrl": image_url, "entropy": 0.0}
    for t in TASKS:
        p = np.array(rec[t])
        i = int(p.argmax())
        out[t] = {"label": CLASSES[t][i], "confidence": float(p[i])}
        out["entropy"] += float(-(p * np.log(np.clip(p, 1e-12, 1))).sum())
    return out


def badness(probs: list[float]) -> float:
    # shortcut: assumes labels in config.json go from best to worst (fresh, defective; or Extra, Class I,
    # Class II). Upgrade to an explicit "worst" list in config.json if that ever stops being true.
    return float(np.dot(np.array(probs), np.arange(len(probs))))
