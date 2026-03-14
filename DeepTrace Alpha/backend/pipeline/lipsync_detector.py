"""
DeepTrace — Lip-Sync Detector
Computes Pearson correlation between per-frame mouth-region motion
(Haar-cascade detected, then optical-flow magnitude) and per-frame
audio RMS energy extracted via ffmpeg.

Low / negative correlation → face-swap or audio replacement.
Score ∈ [0, 1] where 1 = strong desynchronisation (manipulation signal).
"""
import cv2
import numpy as np
import subprocess
import tempfile
import os
import wave
from typing import Dict, Any, List, Tuple, Optional


# ──────────────────────────────────────────────────────────────────────────────
# Public API
# ──────────────────────────────────────────────────────────────────────────────

def analyze_lipsync(
    frames: List[np.ndarray],
    media_path: str,
    fps: float,
) -> Dict[str, Any]:
    if len(frames) < 4:
        return _fallback("Too few frames for lip-sync analysis.")

    mouth_deltas = _mouth_motion_series(frames)
    audio_energy = _audio_energy_series(media_path, len(frames), fps)

    if not mouth_deltas or not audio_energy:
        return _fallback("Could not extract mouth motion or audio energy signal.")

    min_len = min(len(mouth_deltas), len(audio_energy))
    mm = np.array(mouth_deltas[:min_len], dtype=np.float64)
    ae = np.array(audio_energy[:min_len], dtype=np.float64)

    # Pearson correlation (undefined if either signal is constant)
    if np.std(mm) < 1e-6 or np.std(ae) < 1e-6:
        correlation = 0.0
    else:
        correlation = float(np.corrcoef(mm, ae)[0, 1])
        if not np.isfinite(correlation):
            correlation = 0.0

    # Map correlation [-1, +1] → manipulation score [1, 0]
    # High positive correlation = good sync = low score
    sync_score = float(np.clip((1.0 - correlation) / 2.0, 0.0, 1.0))

    return {
        "score": sync_score,
        "details": {
            "pearson_correlation": round(correlation, 4),
            "mouth_frames_detected": int(np.sum(np.array(mouth_deltas) > 0)),
            "frames_compared": min_len,
        },
        "explanation": _explanation(correlation),
    }


# ──────────────────────────────────────────────────────────────────────────────
# Mouth motion
# ──────────────────────────────────────────────────────────────────────────────

def _mouth_motion_series(frames: List[np.ndarray]) -> List[float]:
    """
    Detect face, crop lower-third as mouth ROI, compute mean absolute
    difference between consecutive ROIs as proxy for mouth movement.
    Falls back to full-frame lower-quarter if face cascade finds nothing.
    """
    cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    face_cascade = cv2.CascadeClassifier(cascade_path)

    prev_roi: Optional[np.ndarray] = None
    deltas: List[float] = []

    for frame in frames:
        gray  = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        h, w  = gray.shape
        faces = face_cascade.detectMultiScale(
            gray, scaleFactor=1.1, minNeighbors=3, minSize=(50, 50)
        )

        if len(faces) > 0:
            x, y, fw, fh = faces[0]
            # Mouth region: lower 40% of face bounding box
            my = y + int(fh * 0.60)
            mh = int(fh * 0.40)
            roi = gray[my : my + mh, x : x + fw]
        else:
            # Fallback: bottom quarter of full frame
            roi = gray[int(h * 0.75) :, :]

        if roi.size == 0:
            deltas.append(0.0)
            prev_roi = None
            continue

        if prev_roi is not None:
            if prev_roi.shape == roi.shape:
                delta = float(np.mean(np.abs(roi.astype(np.float32) - prev_roi.astype(np.float32))))
            else:
                delta = 0.0
        else:
            delta = 0.0

        deltas.append(delta)
        prev_roi = roi

    return deltas


# ──────────────────────────────────────────────────────────────────────────────
# Per-frame audio energy
# ──────────────────────────────────────────────────────────────────────────────

def _audio_energy_series(
    media_path: str,
    n_frames: int,
    fps: float,
) -> List[float]:
    """Extract RMS audio energy aligned to each video frame."""
    tmp_path: Optional[str] = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp_path = tmp.name

        result = subprocess.run(
            [
                "ffmpeg", "-y", "-i", media_path,
                "-vn", "-acodec", "pcm_s16le",
                "-ar", "8000", "-ac", "1",
                tmp_path,
            ],
            capture_output=True,
            timeout=20,
        )
        if result.returncode != 0:
            return []

        with wave.open(tmp_path, "rb") as wf:
            sr  = wf.getframerate()
            raw = wf.readframes(wf.getnframes())
            audio = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0

        # RMS per video frame window
        frame_samples = max(1, len(audio) // max(n_frames, 1))
        energies: List[float] = []
        for i in range(n_frames):
            s = i * frame_samples
            e = s + frame_samples
            chunk = audio[s:e] if e <= len(audio) else audio[s:]
            energies.append(float(np.sqrt(np.mean(chunk ** 2))) if len(chunk) > 0 else 0.0)

        return energies

    except Exception:
        return []
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except OSError:
                pass


# ──────────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────────

def _explanation(correlation: float) -> str:
    if correlation < -0.10:
        return (
            "Lip sync: inverse correlation between mouth motion and audio energy — "
            "strong face-swap or audio-replacement indicator."
        )
    if correlation < 0.25:
        return (
            "Lip sync: very low mouth-audio correlation; generated or replaced audio strongly suspected."
        )
    if correlation < 0.55:
        return (
            "Lip sync: moderate correlation with temporal misalignment — possible re-dubbing."
        )
    return "Lip sync: strong correlation between mouth movement and audio energy — consistent with authentic recording."


def _fallback(reason: str) -> Dict[str, Any]:
    return {
        "score": 0.30,
        "details": {},
        "explanation": f"Lip sync: {reason}",
    }
