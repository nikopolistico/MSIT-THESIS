"""Measure the model on the held-out test split and save the result for the Admin Dashboard.

Usage: python evaluate.py "<maturity dataset>.zip" "<quality dataset>.zip"
Reads the test rows of model/deploy/splits.csv straight from the dataset zips (nothing is extracted),
runs the model, and writes model/deploy/evaluation.json, which /api/metrics serves.

Each test image has the label of ONE task (the maturity and quality datasets are separate), so a
maturity image is scored with the maturity head and a quality image with the quality head.
"""

import csv
import json
import sys
import zipfile
from datetime import date
from io import BytesIO
from pathlib import Path, PurePosixPath

import numpy as np
from PIL import Image

from grading.config import CLASSES, DEPLOY, cfg
from grading.model import infer

SPLIT = "test"

rows = [r for r in csv.DictReader(open(DEPLOY / "splits.csv", encoding="utf-8-sig")) if r["split"] == SPLIT]
name_of = lambda r: PurePosixPath(r["path"].replace("\\", "/")).name

# filename -> (zip, entry); the zips also hold augmented copies, only the originals were used.
index = {}
for zip_path in sys.argv[1:]:
    zf = zipfile.ZipFile(zip_path)
    for info in zf.infolist():
        if "Original Dataset" in info.filename and not info.is_dir():
            index[PurePosixPath(info.filename).name] = (zf, info)

truth = {t: [] for t in CLASSES}
pred = {t: [] for t in CLASSES}
for n, r in enumerate(rows, 1):
    zf, info = index[name_of(r)]  # KeyError here means a dataset zip is missing
    probs = infer(Image.open(BytesIO(zf.read(info))))[r["task"]]
    truth[r["task"]].append(CLASSES[r["task"]].index(r["label"]))
    pred[r["task"]].append(int(np.argmax(probs)))
    if n % 50 == 0:
        print(f"{n}/{len(rows)}", flush=True)


def scores(y, p, k):
    y, p = np.array(y), np.array(p)
    f1 = []
    for c in range(k):
        tp = int(((p == c) & (y == c)).sum())
        fp = int(((p == c) & (y != c)).sum())
        fn = int(((p != c) & (y == c)).sum())
        f1.append(2 * tp / (2 * tp + fp + fn) if tp else 0.0)
    return {"n": len(y), "accuracy": float((y == p).mean()), "macroF1": float(np.mean(f1))}


tasks = {t: scores(truth[t], pred[t], len(CLASSES[t])) for t in CLASSES}
allt = np.concatenate([truth[t] for t in CLASSES])
allp = np.concatenate([pred[t] for t in CLASSES])
result = {
    "date": date.today().isoformat(),
    "split": SPLIT,
    "model": cfg["model_file"],
    "n": int(len(allt)),
    "accuracy": float((allt == allp).mean()),  # all test images pooled
    "macroF1": float(np.mean([s["macroF1"] for s in tasks.values()])),  # mean of the task macro-F1s
    "tasks": tasks,
}
Path(DEPLOY / "evaluation.json").write_text(json.dumps(result, indent=2))
print(json.dumps(result, indent=2))
