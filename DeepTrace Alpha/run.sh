#!/usr/bin/env bash
# DeepTrace — Start Script
# Usage: ./run.sh [port]

set -e

PORT=${1:-8000}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$SCRIPT_DIR/backend"

echo ""
echo "╔═══════════════════════════════════════════╗"
echo "║        DeepTrace — Cyberthon'26           ║"
echo "║   Deepfake Trust & Attribution System     ║"
echo "╚═══════════════════════════════════════════╝"
echo ""

# Check Python
if ! command -v python3 &> /dev/null; then
  echo "❌  python3 not found. Please install Python 3.9+."
  exit 1
fi

# Install dependencies
echo "📦  Installing Python dependencies..."
pip install -q --break-system-packages \
  fastapi uvicorn[standard] python-multipart \
  opencv-python-headless numpy scipy aiofiles \
  2>/dev/null || pip install -q \
  fastapi uvicorn python-multipart \
  opencv-python-headless numpy scipy aiofiles

# Check ffmpeg
if command -v ffmpeg &> /dev/null; then
  echo "✅  ffmpeg detected (audio + provenance analysis enabled)"
else
  echo "⚠️   ffmpeg not found — audio and provenance detectors will use fallback scores"
  echo "    Install: sudo apt install ffmpeg   (or brew install ffmpeg on macOS)"
fi

echo ""
echo "🚀  Starting DeepTrace on http://localhost:$PORT"
echo "    Press Ctrl+C to stop."
echo ""

cd "$BACKEND"
python3 -m uvicorn main:app --host 0.0.0.0 --port "$PORT" --reload
