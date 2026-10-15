"""Paths, environment and the settings read from model/deploy/config.json."""

import json
import os
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
DEPLOY = ROOT / "model" / "deploy"
# Expert decisions and the review pool live in DATA_DIR, so a deployed server can keep them on a
# persistent volume. The reference images ship with the code and stay next to it.
DATA = Path(os.getenv("DATA_DIR", ROOT / "data"))
POOL = DATA / "pool"
DB = DATA / "db.json"
REFERENCE = ROOT / "data" / "reference"  # filled by extract_reference.py
STATIC = Path(os.getenv("STATIC_DIR", ROOT / "static"))
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")

POOL.mkdir(parents=True, exist_ok=True)
REFERENCE.mkdir(parents=True, exist_ok=True)

cfg = json.loads((DEPLOY / "config.json").read_text())
CLASSES: dict[str, list[str]] = cfg["classes"]
TASKS = list(CLASSES)  # ["maturity", "quality"]
SIZE = cfg["input"]["size"]
MEAN = np.array(cfg["input"]["mean"], dtype="float32").reshape(3, 1, 1)
STD = np.array(cfg["input"]["std"], dtype="float32").reshape(3, 1, 1)
K = cfg["ood"]["k"]

MAX_UPLOAD = 10 * 1024 * 1024
IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp", ".heic"}
