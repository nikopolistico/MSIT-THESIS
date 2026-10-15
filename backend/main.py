"""Backend for the review UI: runs the ONNX model in model/deploy and stores expert feedback.

Run from this folder:  uvicorn main:app --port 8000
Images dropped into data/pool/ become the unlabeled review queue (scanned on every queue request).
The code lives in the grading/ package; this file only assembles the app.
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from grading.config import CORS_ORIGINS, POOL, REFERENCE, STATIC
from grading.routes import router

app = FastAPI(title="Dragon fruit review backend")
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(router)
# Mount the more specific path first, or /media would swallow /media/ref.
app.mount("/media/ref", StaticFiles(directory=REFERENCE), name="reference")
app.mount("/media", StaticFiles(directory=POOL), name="media")

# The built frontend, so one server can serve the app and the API together (see the root Dockerfile).
# Keep this last: the catch-all route must not shadow the API routes above.
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
