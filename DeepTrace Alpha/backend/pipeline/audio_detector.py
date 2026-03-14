"""
DeepTrace — Audio Detector
Three forensic channels:
  1. Spectral Flatness (Wiener Entropy) — neural vocoders produce unnaturally
     flat spectra compared to natural speech (Mazen & Evans, 2022).
  2. Spectral Flux Continuity — audio splicing creates abrupt spectral jumps.
  3. Silence Pattern Analysis — TTS concatenation produces unnatural silence
     distribution (many short silence segments between utterances).

Score ∈ [0, 1] where 1 = high manipulation probability.
Gracefully falls back if ffmpeg is unavailable.
"""
import numpy as np
import subprocess
import tempfile
import os
import wave
from typing import Dict, Any, List, Optional, Tuple


# ──────────────────────────────────────────────────────────────────────────────
# Public API
# ──────────────────────────────────────────────────────────────────────────────

def analyze_audio(media_path: str) -> Dict[str, Any]:
    audio, sr = _extract_audio_pcm(media_path)

    if audio is None or len(audio) < sr * 0.5:   # need ≥ 0.5 s of audio
        return _fallback("No usable audio track found — audio analysis skipped.")

    flatness_score    = _spectral_flatness_score(audio, sr)
    continuity_score  = _spectral_flux_continuity(audio, sr)
    silence_score     = _silence_pattern_score(audio, sr)

    final_score = (
        flatness_score   * 0.40 +
        continuity_score * 0.35 +
        silence_score    * 0.25
    )

    return {
        "score": float(np.clip(final_score, 0.0, 1.0)),
        "details": {
            "spectral_flatness":     round(float(flatness_score),   4),
            "spectral_continuity":   round(float(continuity_score), 4),
            "silence_pattern":       round(float(silence_score),    4),
            "sample_rate":           sr,
            "duration_s":            round(len(audio) / sr, 2),
        },
        "explanation": _explanation(flatness_score, continuity_score, silence_score),
    }


# ──────────────────────────────────────────────────────────────────────────────
# Audio extraction
# ──────────────────────────────────────────────────────────────────────────────

def _extract_audio_pcm(media_path: str) -> Tuple[Optional[np.ndarray], int]:
    """Use ffmpeg to decode audio to 16-kHz mono PCM WAV."""
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp_path = tmp.name

        result = subprocess.run(
            [
                "ffmpeg", "-y", "-i", media_path,
                "-vn",                          # drop video
                "-acodec", "pcm_s16le",
                "-ar",     "16000",
                "-ac",     "1",
                tmp_path,
            ],
            capture_output=True,
            timeout=25,
        )

        if result.returncode != 0:
            return None, 16000

        with wave.open(tmp_path, "rb") as wf:
            sr      = wf.getframerate()
            raw     = wf.readframes(wf.getnframes())
            audio   = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0

        return audio, sr

    except Exception:
        return None, 16000
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except OSError:
                pass


# ──────────────────────────────────────────────────────────────────────────────
# Sub-analysers
# ──────────────────────────────────────────────────────────────────────────────

def _spectral_flatness_score(audio: np.ndarray, sr: int) -> float:
    """
    Spectral flatness (Wiener entropy) = geometric_mean(|X|) / arithmetic_mean(|X|).
    Natural speech: 0.05–0.25  |  TTS/vocoder: 0.35–0.70
    """
    frame_size = 1024
    hop_size   =  512
    flatness_vals: List[float] = []

    for start in range(0, len(audio) - frame_size, hop_size):
        frame    = audio[start : start + frame_size] * np.hanning(frame_size)
        spectrum = np.abs(np.fft.rfft(frame)) + 1e-10

        geo_mean  = float(np.exp(np.mean(np.log(spectrum))))
        arith_mean= float(np.mean(spectrum))
        flatness_vals.append(geo_mean / (arith_mean + 1e-10))

    if not flatness_vals:
        return 0.40

    avg = float(np.mean(flatness_vals))
    # Calibration: natural ≈ 0.15 → score ≈ 0.0 | vocoder ≈ 0.55 → score ≈ 1.0
    return float(np.clip((avg - 0.15) / 0.40, 0.0, 1.0))


def _spectral_flux_continuity(audio: np.ndarray, sr: int) -> float:
    """
    Spectral flux = mean squared difference between adjacent spectra.
    Audio splicing creates isolated flux spikes; high coefficient of variation
    in flux is a manipulation signal.
    """
    frame_size = 1024
    hop_size   =  512
    spectra: List[np.ndarray] = []

    for start in range(0, len(audio) - frame_size, hop_size):
        frame = audio[start : start + frame_size] * np.hanning(frame_size)
        spectra.append(np.abs(np.fft.rfft(frame)))
        if len(spectra) >= 100:          # cap frames for speed
            break

    if len(spectra) < 3:
        return 0.30

    fluxes = [
        float(np.sqrt(np.mean((spectra[i] - spectra[i-1]) ** 2)))
        for i in range(1, len(spectra))
    ]

    cv = float(np.std(fluxes)) / (float(np.mean(fluxes)) + 1e-7)
    return float(np.clip(cv / 2.5, 0.0, 1.0))


def _silence_pattern_score(audio: np.ndarray, sr: int) -> float:
    """
    TTS systems concatenate phonemes with micro-silences; detect via
    short-time energy transitions above a threshold count per second.
    """
    frame_samples = sr // 20            # 50-ms frames
    energies      = np.array([
        float(np.mean(audio[i : i + frame_samples] ** 2))
        for i in range(0, len(audio) - frame_samples, frame_samples)
    ])

    if len(energies) < 4:
        return 0.20

    threshold       = float(np.percentile(energies, 15))
    silence_mask    = (energies < threshold).astype(int)
    transitions     = int(np.sum(np.abs(np.diff(silence_mask))))
    duration_s      = len(audio) / sr

    transitions_per_sec = transitions / max(duration_s, 1.0)
    # Natural speech: ~2–5 silence transitions/s | TTS stitching: 8+
    return float(np.clip((transitions_per_sec - 3.0) / 7.0, 0.0, 1.0))


# ──────────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────────

def _explanation(flatness: float, continuity: float, silence: float) -> str:
    parts: List[str] = []

    if flatness > 0.65:
        parts.append("spectral flatness strongly elevated — neural vocoder / TTS signature detected")
    elif flatness > 0.40:
        parts.append("mildly elevated Wiener entropy; possible voice processing applied")

    if continuity > 0.60:
        parts.append("abrupt spectral flux spikes indicate audio segment splicing")
    elif continuity > 0.35:
        parts.append("moderate flux variability; minor discontinuities present")

    if silence > 0.60:
        parts.append("unnatural silence micro-segment distribution typical of TTS concatenation")

    if not parts:
        parts.append("audio characteristics align with natural human phonation")

    return "Audio forensics: " + "; ".join(parts) + "."


def _fallback(reason: str) -> Dict[str, Any]:
    return {
        "score": 0.35,
        "details": {},
        "explanation": f"Audio forensics: {reason}",
    }
