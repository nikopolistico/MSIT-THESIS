FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 DATA_DIR=/data
WORKDIR /app

# libgomp is needed by the machine-learning wheels on a slim image.
RUN apt-get update \
 && apt-get install -y --no-install-recommends libgomp1 \
 && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py ./
COPY grading ./grading
COPY model ./model
COPY data/reference ./data/reference

# The review pool and the expert decisions are written to DATA_DIR. Mount a persistent volume
# there, or they are lost every time the container restarts.
RUN mkdir -p /data
VOLUME ["/data"]

EXPOSE 8000
# One worker on purpose: expert decisions are kept in memory and saved to a single JSON file.
CMD ["sh", "-c", "exec uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1"]
