"""
DeepTrace — Provenance Analyser
Evaluates media authenticity through metadata archaeology:

  1. Metadata Completeness — stripped/missing tags are a red flag for deepfakes
     that are re-exported or scraped from sharing platforms.
  2. Codec Chain Health   — multiple re-encodes degrade bitrate and strip provenance.
  3. Compression Depth    — extremely low bits-per-pixel suggests generation artefact
     or aggressive post-processing to erase traces.

Returns provenance_score ∈ [0, 1] where 1 = STRONG provenance (authentic),
0 = WEAK provenance (suspicious).  Note: this is the inverse of the other
detector scores; trust_scorer applies (1 - provenance_score) in the formula.
"""
import subprocess
import json
import os
import numpy as np
from datetime import datetime, timezone
from typing import Dict, Any, Optional


# ──────────────────────────────────────────────────────────────────────────────
# Public API
# ──────────────────────────────────────────────────────────────────────────────

def analyze_provenance(media_path: str) -> Dict[str, Any]:
    metadata = _ffprobe(media_path)

    if not metadata:
        return {
            "score": 0.30,
            "details": {"note": "ffprobe unavailable; provenance analysis skipped"},
            "explanation": "Provenance: ffprobe could not be executed; defaulting to low trust.",
        }

    meta_score        = _metadata_completeness(metadata)
    codec_score       = _codec_chain_health(metadata)
    compression_score = _compression_depth(metadata)

    # Weighted provenance (all sub-scores: 1 = healthy)
    provenance_score = (
        meta_score        * 0.40 +
        codec_score       * 0.35 +
        compression_score * 0.25
    )

    video_codec  = _video_codec(metadata)
    format_name  = metadata.get("format", {}).get("format_name", "unknown")
    duration_s   = float(metadata.get("format", {}).get("duration", 0) or 0)
    file_size_mb = float(metadata.get("format", {}).get("size", 0) or 0) / 1e6

    return {
        "score": float(np.clip(provenance_score, 0.0, 1.0)),
        "details": {
            "metadata_completeness": round(float(meta_score),        4),
            "codec_chain_health":    round(float(codec_score),       4),
            "compression_depth":     round(float(compression_score), 4),
            "format":      format_name,
            "codec":       video_codec,
            "duration_s":  round(duration_s,   2),
            "size_mb":     round(file_size_mb, 3),
        },
        "explanation": _explanation(meta_score, codec_score, compression_score),
    }


# ──────────────────────────────────────────────────────────────────────────────
# ffprobe
# ──────────────────────────────────────────────────────────────────────────────

def _ffprobe(path: str) -> Optional[Dict]:
    try:
        result = subprocess.run(
            [
                "ffprobe", "-v", "quiet",
                "-print_format", "json",
                "-show_format", "-show_streams",
                path,
            ],
            capture_output=True,
            text=True,
            timeout=15,
        )
        if result.returncode == 0 and result.stdout:
            return json.loads(result.stdout)
        return None
    except Exception:
        return None


# ──────────────────────────────────────────────────────────────────────────────
# Sub-analysers
# ──────────────────────────────────────────────────────────────────────────────

def _metadata_completeness(metadata: Dict) -> float:
    """
    Check for presence and consistency of expected metadata fields.
    Authentic recordings typically carry: creation_time, encoder, location,
    make/model (camera).  Deepfake re-exports typically strip all of these.
    """
    tags      = metadata.get("format", {}).get("tags", {})
    score     = 0.40    # neutral start

    # Presence bonuses
    if "creation_time" in tags:
        score += 0.20
        try:
            ct = tags["creation_time"].replace("Z", "+00:00")
            dt = datetime.fromisoformat(ct)
            now = datetime.now(timezone.utc)
            # Sanity: creation time should be in the past and not before 1990
            if dt.year >= 1990 and dt <= now:
                score += 0.10
            else:
                score -= 0.15   # impossible timestamp → manipulated
        except Exception:
            score -= 0.05

    if "encoder" in tags or "Encoder" in tags:
        score += 0.10
        enc = (tags.get("encoder") or tags.get("Encoder") or "").lower()
        # Common GAN export encoders
        if any(x in enc for x in ["lavf", "libx264", "ffmpeg"]):
            score -= 0.05   # slight penalty: neutral re-encoder

    if "com.apple.quicktime.location.ISO6709" in tags:
        score += 0.10       # GPS metadata rarely survives deepfake pipelines

    if not tags:
        score -= 0.20       # completely stripped metadata

    return float(np.clip(score, 0.0, 1.0))


def _codec_chain_health(metadata: Dict) -> float:
    """
    Evaluate video stream for signs of multiple re-encoding.
    Indicators: very low bitrate, lossy codec applied multiple times.
    """
    streams      = metadata.get("streams", [])
    video_streams= [s for s in streams if s.get("codec_type") == "video"]

    if not video_streams:
        return 0.40     # no video stream — neutral-low

    vs    = video_streams[0]
    score = 0.70

    # Bitrate per pixel check
    br     = int(vs.get("bit_rate", 0) or 0)
    width  = int(vs.get("width",    0) or 0)
    height = int(vs.get("height",   0) or 0)

    if width > 0 and height > 0 and br > 0:
        bpp = br / (width * height + 1)   # bits per pixel per second
        if bpp < 0.5:
            score -= 0.35   # extremely low → heavy compression, likely re-encoded
        elif bpp < 1.5:
            score -= 0.15
        elif bpp > 8.0:
            score += 0.10   # high-quality capture

    # Codec penalties
    codec = vs.get("codec_name", "").lower()
    if codec in ("vp8", "vp9"):
        score -= 0.10   # web codecs common after platform re-encoding

    # Profile check (missing profile suggests non-standard encoder)
    if not vs.get("profile"):
        score -= 0.05

    return float(np.clip(score, 0.0, 1.0))


def _compression_depth(metadata: Dict) -> float:
    """
    Estimate compression generation count from file-level size vs duration.
    Multiple encode cycles drastically reduce effective bitrate.
    """
    fmt       = metadata.get("format", {})
    size_b    = float(fmt.get("size",     0) or 0)
    duration  = float(fmt.get("duration", 0) or 0)

    if duration <= 0 or size_b <= 0:
        return 0.50

    kbps = (size_b * 8) / (duration * 1000)    # total bitrate in kbps

    # Thresholds calibrated on typical social-media re-encode chains
    if kbps > 5000:
        return 1.00    # original-quality / lossless
    if kbps > 2000:
        return 0.85
    if kbps > 800:
        return 0.65
    if kbps > 300:
        return 0.40    # likely 2–3 re-encode cycles
    return 0.15        # extremely compressed → provenance nearly gone


# ──────────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────────

def _video_codec(metadata: Dict) -> str:
    for s in metadata.get("streams", []):
        if s.get("codec_type") == "video":
            return s.get("codec_name", "unknown")
    return "unknown"


def _explanation(meta: float, codec: float, compression: float) -> str:
    parts = []

    if meta < 0.35:
        parts.append("metadata stripped or corrupted — common in deepfake distribution chains")
    elif meta > 0.65:
        parts.append("creation metadata present and internally consistent")

    if codec < 0.40:
        parts.append("codec chain shows signs of multiple lossy re-encoding cycles")
    elif codec > 0.70:
        parts.append("high-quality codec configuration consistent with direct capture")

    if compression < 0.35:
        parts.append("extreme compression depth suggests provenance-erasing post-processing")
    elif compression > 0.80:
        parts.append("high bitrate indicates minimal generational compression loss")

    if not parts:
        parts.append("provenance signals broadly consistent with original capture")

    return "Provenance: " + "; ".join(parts) + "."
