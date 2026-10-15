"""The training-set reference embeddings: out-of-distribution score and the reference rows."""

import csv
from pathlib import PurePosixPath

import numpy as np

from .config import CLASSES, DEPLOY, K, cfg

REFS = np.load(DEPLOY / cfg["ood"]["reference_file"]).astype("float32")
# ref_embeddings.npy holds the embeddings of the train split, in splits.csv order (verified: nearest
# neighbors share labels). Each row has ONE label: from the maturity or the quality dataset.
REF_ROWS = [
    r for r in csv.DictReader(open(DEPLOY / "splits.csv", encoding="utf-8-sig")) if r["split"] == "train"
]
assert len(REF_ROWS) == len(REFS), "splits.csv train rows must match ref_embeddings.npy"
REF_FILES = [PurePosixPath(r["path"].replace("\\", "/")).name for r in REF_ROWS]
REF_BY_TASK = {t: np.array([i for i, r in enumerate(REF_ROWS) if r["task"] == t]) for t in CLASSES}


def ood_similarity(emb: np.ndarray) -> float:
    # shortcut: mean of the top-k cosine similarities to the reference set; config.json doesn't say
    # whether the cutoff was calibrated on mean or k-th similarity. Re-check against your training notebook.
    return float(np.sort(REFS @ emb)[-K:].mean())
