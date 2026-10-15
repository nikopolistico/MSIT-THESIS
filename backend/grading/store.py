"""Persistent state: cached predictions of the review pool and the expert decisions (kNN memory bank)."""

import json
import threading
from datetime import datetime, timezone
from urllib.parse import quote

from PIL import Image

from .config import DB, IMAGE_EXT, POOL
from .model import infer
from .scoring import summary

# state["items"]: cached predictions of pool images. state["decisions"]: expert labels = kNN memory bank.
lock = threading.Lock()
state: dict = json.loads(DB.read_text()) if DB.exists() else {"items": {}, "decisions": []}


def save() -> None:
    tmp = DB.with_suffix(".tmp")
    tmp.write_text(json.dumps(state))
    tmp.replace(DB)


def scan_pool() -> None:
    """Predict every new image dropped into the pool folder."""
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
    """Unreviewed pool images, most uncertain first."""
    done = {d["itemId"] for d in state["decisions"]}
    ids = [i for i in state["items"] if i not in done and (POOL / i).exists()]
    return sorted(ids, key=lambda i: -summary(i, state["items"][i], "")["entropy"])


def add_decision(item_id: str, rec: dict, expert_maturity: str, expert_quality: str, note: str | None) -> None:
    model = summary(item_id, rec, "")
    # Appending to decisions IS the "add to kNN memory bank immediately" step.
    state["decisions"].append(
        {
            "id": f"dec-{len(state['decisions']) + 1}",
            "itemId": item_id,
            "imageUrl": f"/media/{quote(item_id)}",
            "modelMaturity": model["maturity"]["label"],
            "modelQuality": model["quality"]["label"],
            "expertMaturity": expert_maturity,
            "expertQuality": expert_quality,
            "note": note,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "emb": rec["emb"],
        }
    )
    save()
