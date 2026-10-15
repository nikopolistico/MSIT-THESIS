"""The ONNX model: image preprocessing and one forward pass."""

import numpy as np
import onnxruntime as ort
from PIL import Image, ImageOps

from .config import DEPLOY, MEAN, SIZE, STD, cfg

try:  # phone photos
    import pillow_heif

    pillow_heif.register_heif_opener()
except ImportError:
    pass

session = ort.InferenceSession(str(DEPLOY / cfg["model_file"]), providers=["CPUExecutionProvider"])


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
