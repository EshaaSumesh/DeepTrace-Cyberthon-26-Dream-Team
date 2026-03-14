"""
DeepTrace — Grad-CAM Style Heatmap Generator
Produces per-frame manipulation heatmaps without requiring a trained CNN.

Approach: Signal-based saliency map
  • For each sampled frame we compute a per-pixel manipulation likelihood map
    from three independent forensic channels:
      1. Local DCT high-frequency anomaly (8×8 blocks → interpolated map)
      2. Local noise kurtosis deviation (16×16 blocks)
      3. Face-region weighting (Haar cascade; face area gets higher weight)
  • The three maps are blended and normalised → JET colormap overlay

Output:
  • List of base64-encoded PNG strings (one per key frame)
  • Summary heatmap (average across all frames)

These can be embedded directly in the API JSON response as data: URIs.
"""
import cv2
import numpy as np
import base64
from typing import List, Dict, Any, Optional


# ──────────────────────────────────────────────────────────────────────────────
# Public API
# ──────────────────────────────────────────────────────────────────────────────

def generate_heatmaps(
    frames: List[np.ndarray],
    max_key_frames: int = 5,
) -> Dict[str, Any]:
    """
    Produce manipulation-saliency heatmaps for up to max_key_frames frames.

    Returns:
        {
          "summary_heatmap": "<base64 PNG>",     # average across all frames
          "key_frames": [                         # up to max_key_frames
            {
              "index": int,
              "heatmap_b64": "<base64 PNG>",
              "manipulation_density": float,      # mean activation ∈ [0,1]
            }
          ],
          "hotspot_description": str,
        }
    """
    if not frames:
        return {"summary_heatmap": None, "key_frames": [], "hotspot_description": "No frames available."}

    cascade_path  = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    face_cascade  = cv2.CascadeClassifier(cascade_path)

    # Step 1: Compute raw manipulation maps for all frames
    raw_maps: List[np.ndarray] = []
    for frame in frames:
        raw_maps.append(_manipulation_map(frame, face_cascade))

    # Step 2: Summary heatmap (mean of all maps)
    summary_raw = np.mean(np.stack(raw_maps), axis=0)
    summary_b64 = _map_to_b64(summary_raw, frames[len(frames)//2])

    # Step 3: Select key frames — highest mean activation
    densities  = [float(np.mean(m)) for m in raw_maps]
    step       = max(1, len(frames) // max_key_frames)
    candidates = list(range(0, len(frames), step))[:max_key_frames]
    # sort by activation, pick top max_key_frames
    candidates = sorted(candidates, key=lambda i: densities[i], reverse=True)[:max_key_frames]
    candidates = sorted(candidates)   # restore temporal order

    key_frames = []
    for idx in candidates:
        kf_b64 = _map_to_b64(raw_maps[idx], frames[idx])
        key_frames.append({
            "index":                idx,
            "heatmap_b64":          kf_b64,
            "manipulation_density": round(densities[idx], 4),
        })

    hotspot = _hotspot_description(summary_raw, densities)

    return {
        "summary_heatmap": summary_b64,
        "key_frames":      key_frames,
        "hotspot_description": hotspot,
    }


# ──────────────────────────────────────────────────────────────────────────────
# Manipulation map construction
# ──────────────────────────────────────────────────────────────────────────────

def _manipulation_map(frame: np.ndarray, face_cascade) -> np.ndarray:
    """
    Produce a [0,1] float32 map of the same height/width as the frame.
    High values = pixels/regions more likely to carry manipulation artifacts.
    """
    h, w  = frame.shape[:2]
    gray  = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY).astype(np.float32)

    # ── Channel 1: DCT HF energy map ──────────────────────────────────────
    dct_map = _dct_hf_map(gray, block=8)          # small → smoother

    # ── Channel 2: Noise kurtosis map ─────────────────────────────────────
    noise_map = _noise_kurtosis_map(gray, block=16)

    # ── Channel 3: Face-region boost ──────────────────────────────────────
    face_weight = np.ones((h, w), dtype=np.float32) * 0.3   # background base

    gray_u8 = gray.astype(np.uint8)
    faces = face_cascade.detectMultiScale(gray_u8, 1.1, 3, minSize=(40,40))
    if len(faces) > 0:
        for (fx, fy, fw, fh) in faces:
            # Full face area: elevated weight
            face_weight[fy:fy+fh, fx:fx+fw] = 1.0
            # Forehead/eye region: highest (most common manipulation site)
            enh = max(0, fy - int(fh*0.15))
            face_weight[enh:fy+int(fh*0.55), fx:fx+fw] = 1.0

    # Blend channels
    combined = (dct_map * 0.45 + noise_map * 0.35 + face_weight * 0.20)
    combined = combined / (np.max(combined) + 1e-8)          # normalise

    # Gaussian smooth for visual clarity
    combined = cv2.GaussianBlur(combined, (15, 15), 0)
    return np.clip(combined, 0.0, 1.0)


def _dct_hf_map(gray: np.ndarray, block: int = 8) -> np.ndarray:
    """Block-wise DCT HF energy → interpolated full-resolution map."""
    h, w = gray.shape
    bh   = h // block
    bw   = w // block
    mini = np.zeros((bh, bw), dtype=np.float32)

    for i in range(bh):
        for j in range(bw):
            patch = gray[i*block:(i+1)*block, j*block:(j+1)*block]
            dct   = cv2.dct(patch)
            total = float(np.sum(np.abs(dct))) + 1e-7
            hf    = float(np.sum(np.abs(dct[block//2:, block//2:])))
            mini[i, j] = hf / total

    # Resize to full resolution
    full = cv2.resize(mini, (w, h), interpolation=cv2.INTER_CUBIC)
    # Normalise
    full = (full - full.min()) / (full.max() - full.min() + 1e-8)
    return full.astype(np.float32)


def _noise_kurtosis_map(gray: np.ndarray, block: int = 16) -> np.ndarray:
    """Block-wise noise kurtosis deviation → interpolated map."""
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    noise   = gray - blurred

    h, w = gray.shape
    bh   = h // block
    bw   = w // block
    mini = np.zeros((bh, bw), dtype=np.float32)

    for i in range(bh):
        for j in range(bw):
            patch = noise[i*block:(i+1)*block, j*block:(j+1)*block].flatten()
            sigma = float(np.std(patch))
            if sigma < 0.3:
                mini[i, j] = 0.0
                continue
            mu4  = float(np.mean((patch - np.mean(patch)) ** 4))
            kurt = mu4 / (sigma**4 + 1e-7)
            mini[i, j] = min(abs(kurt - 3.0) / 6.0, 1.0)

    full = cv2.resize(mini, (w, h), interpolation=cv2.INTER_CUBIC)
    full = (full - full.min()) / (full.max() - full.min() + 1e-8)
    return full.astype(np.float32)


# ──────────────────────────────────────────────────────────────────────────────
# Rendering
# ──────────────────────────────────────────────────────────────────────────────

def _map_to_b64(activation: np.ndarray, frame: np.ndarray) -> Optional[str]:
    """Render activation map as JET heatmap blended over the source frame."""
    try:
        h, w = frame.shape[:2]
        act_resized = cv2.resize(activation, (w, h))
        act_u8 = (act_resized * 255).astype(np.uint8)
        jet    = cv2.applyColorMap(act_u8, cv2.COLORMAP_JET)

        # Blend heatmap with original frame (60% original, 40% heatmap)
        blended = cv2.addWeighted(frame, 0.60, jet, 0.40, 0)

        # Encode to PNG → base64
        ok, buf = cv2.imencode(".png", blended)
        if not ok:
            return None
        return base64.b64encode(buf.tobytes()).decode("ascii")

    except Exception:
        return None


# ──────────────────────────────────────────────────────────────────────────────
# Hotspot description
# ──────────────────────────────────────────────────────────────────────────────

def _hotspot_description(summary: np.ndarray, densities: List[float]) -> str:
    mean_act  = float(np.mean(summary))
    max_act   = float(np.max(summary))
    hot_frame = int(np.argmax(densities)) if densities else 0

    # Find dominant quadrant
    h, w = summary.shape
    quad = {
        "top-left":     float(np.mean(summary[:h//2, :w//2])),
        "top-right":    float(np.mean(summary[:h//2, w//2:])),
        "bottom-left":  float(np.mean(summary[h//2:, :w//2])),
        "bottom-right": float(np.mean(summary[h//2:, w//2:])),
    }
    dominant_region = max(quad, key=quad.get)

    if mean_act < 0.20:
        severity = "Low-level signal anomalies"
    elif mean_act < 0.45:
        severity = "Moderate manipulation hotspots"
    else:
        severity = "Strong manipulation concentration"

    return (
        f"{severity} detected. Dominant activation in the {dominant_region} region "
        f"(mean={mean_act:.2f}, peak={max_act:.2f}). "
        f"Highest single-frame activation at frame index {hot_frame}."
    )
