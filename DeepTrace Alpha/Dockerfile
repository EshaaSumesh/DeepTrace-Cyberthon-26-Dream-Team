FROM python:3.11-slim

LABEL maintainer="DeepTrace — Cyberthon'26"
LABEL description="Deepfake Trust & Attribution System"

# System dependencies: ffmpeg + opencv runtime libs
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Optional: yt-dlp for URL analysis
RUN pip install --no-cache-dir yt-dlp

WORKDIR /app

# Install Python dependencies first (layer caching)
COPY backend/requirements.txt .
RUN pip install --no-cache-dir \
    fastapi \
    "uvicorn[standard]" \
    python-multipart \
    opencv-python-headless \
    numpy \
    scipy \
    aiofiles \
    reportlab

# Copy source
COPY backend/ ./backend/
COPY frontend/ ./frontend/

WORKDIR /app/backend

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python3 -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
