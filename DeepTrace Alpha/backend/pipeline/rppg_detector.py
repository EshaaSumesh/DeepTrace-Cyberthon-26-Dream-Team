"""
DeepTrace — rPPG (Remote Photoplethysmography) Detector
Biological signal detection via skin colour micro-variations.

Method (Green-channel rPPG, de Haan & Jeanne, 2013):
  • Detect face with Haar cascade
  • Extract forehead ROI (stable, minimal hair/occlusion)
  • Track mean of the Green channel across sampled frames
  • Detrend & bandpass-filter to isolate cardiac frequency band (0.7–3.5 Hz)
  • Compute SNR of the cardiac band vs. broadband signal

Authentic faces → measurable pulse signal (SNR > threshold)
Synthetic / face-swapped faces → no biological signal → high manipulation score

Score ∈ [0, 1] where 1 = no detectable pulse (high manipulation probability).
"""
import cv2
import numpy as np
from typing import Dict, Any, List, Optional


# Heart-rate band in normalised frequency (assuming ~1 fps effective sampling
# from up-to-30 frames over video duration)
_HR_LOW_NORM  = 0.04    # ≈ 0.7 Hz / 18 Hz Nyquist
_HR_HIGH_NORM = 0.35    # ≈ 3.5 Hz / 10 Hz Nyquist


# ──────────────────────────────────────────────────────────────────────────────
# Public API
# ──────────────────────────────────────────────────────────────────────────────

def analyze_rppg(frames: List[np.ndarray]) -> Dict[str, Any]:
    if len(frames) < 6:
        return _fallback("Too few frames for rPPG analysis (need ≥ 6).")

    cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    face_cascade  = cv2.CascadeClassifier(cascade_path)

    green_signal: List[float] = []
    faces_found: int           = 0

    for frame in frames:
        gray  = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        faces = face_cascade.detectMultiScale(
            gray, scaleFactor=1.1, minNeighbors=4, minSize=(60, 60)
        )

        if len(faces) == 0:
            green_signal.append(float("nan"))
            continue

        faces_found += 1
        x, y, fw, fh = faces[0]

        # Forehead ROI: top 25% of face, inner 60% width (avoid hairline edge)
        roi_y = y + int(fh * 0.05)
        roi_h = int(fh * 0.25)
        roi_x = x + int(fw * 0.20)
        roi_w = int(fw * 0.60)
        roi   = frame[roi_y : roi_y + roi_h, roi_x : roi_x + roi_w]

        if roi.size == 0:
            green_signal.append(float("nan"))
            continue

        # Green channel (index 1 in BGR)
        green_signal.append(float(np.mean(roi[:, :, 1])))

    # Drop NaN entries
    clean = [v for v in green_signal if not np.isnan(v)]

    if len(clean) < 6 or faces_found < 4:
        return _fallback(
            f"Insufficient face frames ({faces_found}/{len(frames)}) for pulse estimation."
        )

    manip_score, snr = _pulse_score(clean)

    return {
        "score": float(np.clip(manip_score, 0.0, 1.0)),
        "details": {
            "faces_found":     faces_found,
            "signal_frames":   len(clean),
            "pulse_snr_db":    round(float(snr), 3),
        },
        "explanation": _explanation(manip_score, snr),
    }


# ──────────────────────────────────────────────────────────────────────────────
# Signal processing
# ──────────────────────────────────────────────────────────────────────────────

def _pulse_score(signal: List[float]) -> tuple:
    """
    Returns (manipulation_score ∈ [0,1], snr_dB).
    High SNR in cardiac band → authentic face → low manipulation score.
    """
    sig = np.array(signal, dtype=np.float64)

    # Linear detrend
    t   = np.arange(len(sig))
    p   = np.polyfit(t, sig, 1)
    sig = sig - np.polyval(p, t)

    # Zero-mean
    sig -= np.mean(sig)

    if np.std(sig) < 0.5:
        # Flat signal → no biological variance → synthetic
        return 0.80, -20.0

    # FFT power spectrum
    n    = len(sig)
    freqs = np.fft.rfftfreq(n)                    # normalised [0, 0.5]
    power = np.abs(np.fft.rfft(sig)) ** 2

    # Cardiac band
    hr_mask    = (freqs >= _HR_LOW_NORM) & (freqs <= _HR_HIGH_NORM)
    hr_power   = float(np.sum(power[hr_mask]))
    total_power= float(np.sum(power)) + 1e-10

    # SNR in dB
    noise_power = total_power - hr_power + 1e-10
    snr_db      = 10.0 * np.log10((hr_power + 1e-10) / noise_power)

    # Map SNR to manipulation score
    # snr_db < 0  → no pulse → score near 1.0
    # snr_db > 5  → clear pulse → score near 0.0
    manip_score = float(np.clip(1.0 - (snr_db + 3.0) / 10.0, 0.0, 1.0))

    return manip_score, snr_db


# ──────────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────────

def _explanation(score: float, snr: float) -> str:
    snr_str = f"{snr:+.1f} dB"
    if score > 0.75:
        return (
            f"rPPG: No detectable cardiac pulse signal (SNR {snr_str}) — "
            "absence of biological rPPG strongly indicates a synthetic face."
        )
    if score > 0.50:
        return (
            f"rPPG: Weak pulse signal (SNR {snr_str}); biological authenticity uncertain."
        )
    if score > 0.30:
        return (
            f"rPPG: Moderate pulse signal detected (SNR {snr_str}); some anomalies present."
        )
    return (
        f"rPPG: Clear cardiac pulse in skin colour signal (SNR {snr_str}) — "
        "consistent with live biological face."
    )


def _fallback(reason: str) -> Dict[str, Any]:
    return {
        "score": 0.35,
        "details": {},
        "explanation": f"rPPG: {reason}",
    }
