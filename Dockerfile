# One container that serves both the app and the API.
# Build from this folder:  docker build -t dragonfruit --build-arg VITE_SUPABASE_URL=... --build-arg VITE_SUPABASE_ANON_KEY=... .

# ---- 1. Build the frontend ------------------------------------------------------------------
FROM node:22-slim AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json frontend/.npmrc ./
RUN npm ci
COPY frontend/ ./
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
# Same origin: the app calls /api on the server that served it, so no API address is baked in.
ENV VITE_API_BASE_URL= \
    VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
RUN npm run build

# ---- 2. The API, with the built frontend next to it -----------------------------------------
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 DATA_DIR=/data
WORKDIR /app

# libgomp is needed by the machine-learning wheels on a slim image.
RUN apt-get update \
 && apt-get install -y --no-install-recommends libgomp1 \
 && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/main.py ./
COPY backend/model ./model
COPY backend/data/reference ./data/reference
COPY --from=web /web/dist ./static

# The review pool and the expert decisions are written to DATA_DIR. Mount a persistent volume
# there, or they are lost every time the container restarts.
RUN mkdir -p /data
VOLUME ["/data"]

EXPOSE 8000
# One worker on purpose: expert decisions are kept in memory and saved to a single JSON file.
CMD ["sh", "-c", "exec uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1"]
