# DeepTrace SKILL — Cyberthon'26 PS-2

## Project Identity
- **Name**: DeepTrace — Deepfake Trust & Attribution System
- **Problem Statement**: PS-2, Cyberthon'26, SRM IST Chennai Ramapuram
- **Track**: AI/ML Security
- **Stack**: Python 3.9+ · FastAPI · OpenCV · NumPy · SciPy · ffmpeg/ffprobe · Vanilla JS

## File Layout
```
deeptrace/
├── backend/
│   ├── main.py                      FastAPI app + /analyze POST route
│   ├── requirements.txt
│   └── pipeline/
│       ├── frame_extractor.py       extract_frames(path, max=30) → frames, fps, duration
│       ├── video_detector.py        analyze_video(frames) → score + details
│       ├── audio_detector.py        analyze_audio(path)   → score + details
│       ├── lipsync_detector.py      analyze_lipsync(frames, path, fps) → score + details
│       ├── rppg_detector.py         analyze_rppg(frames) → score + details
│       ├── provenance_analyzer.py   analyze_provenance(path) → score + details
│       └── trust_scorer.py          compute_trust_score(v,a,l,p) → full result dict
├── frontend/index.html              Single-file dark-theme UI
├── run.sh                           Quick-start (installs deps + starts uvicorn)
└── README.md
```

## Trust Score Formula (CANONICAL — do not change)
```
Trust = 1 − [(Video × 0.40) + (Audio × 0.30) + (LipSync × 0.10) + ((1 − Prov) × 0.20)]
```
- Video, Audio, LipSync → manipulation probability ∈ [0,1]
- Prov (provenance_score) → authenticity ∈ [0,1]; inverted in formula
- Weights sum to 1.0

## Risk Tiers
| Trust   | Level    | Color   |
|---------|----------|---------|
| > 0.70  | LOW      | #22c55e |
| 0.50–0.70 | MEDIUM | #f59e0b |
| 0.30–0.50 | HIGH   | #f97316 |
| < 0.30  | CRITICAL | #ef4444 |

## Detector Sub-Signals

### video_detector.py
- `_dct_artifact_score(frames)` — every 3rd frame, 8×8 DCT blocks with column stride 16; HF energy ratio; calibrated [0.08–0.23] → [0,1]
- `_temporal_consistency_score(frames)` — 4×4 grid regional variance CoV per consecutive pair; clip /2.5
- `_noise_fingerprint_score(frames)` — every 5th frame; GaussianBlur residual; excess kurtosis |k−3|/3

### audio_detector.py
- `_extract_audio_pcm(path)` — ffmpeg → 16kHz mono WAV tempfile
- `_spectral_flatness_score(audio,sr)` — Wiener entropy per 1024-frame; calibrated [0.15–0.55] → [0,1]
- `_spectral_flux_continuity(audio,sr)` — spectral flux CoV; capped 100 frames; clip /2.5
- `_silence_pattern_score(audio,sr)` — 50ms frames; silence transition rate; calibrated [3–10]/s → [0,1]

### lipsync_detector.py
- `_mouth_motion_series(frames)` — Haar face cascade; lower 40% face ROI; mean abs diff
- `_audio_energy_series(path,n,fps)` — ffmpeg 8kHz mono; RMS per video-frame window
- Pearson ρ; map (1−ρ)/2 → score

### rppg_detector.py
- Haar cascade; forehead ROI (top 25%, inner 60% width)
- Green channel mean per frame
- Linear detrend → zero-mean → FFT power
- Cardiac band: 0.04–0.35 normalised freq (≈ 0.7–3.5 Hz at effective 1–2 fps)
- SNR in dB; map 1 − (snr+3)/10 → score

### provenance_analyzer.py
- `_ffprobe(path)` — JSON output, 15s timeout
- `_metadata_completeness` — creation_time (+0.2), encoder (+0.1), GPS (+0.1), no tags (−0.2)
- `_codec_chain_health` — bits-per-pixel thresholds: <0.5(−0.35), <1.5(−0.15), >8(+0.10)
- `_compression_depth` — total kbps: >5000→1.0, >2000→0.85, >800→0.65, >300→0.40, else→0.15

## API Contract
```
POST /analyze
  Body: multipart/form-data, field "file"
  Returns JSON:
  {
    filename, file_size_mb, duration_s, fps, frames_sampled, processing_time_s,
    trust_score, manipulation_score, risk_level, risk_color, risk_description,
    score_breakdown: { video_contribution, audio_contribution, lipsync_contribution, provenance_contribution },
    forensic_explanation,
    detectors: {
      video:      { score, details, frames_analyzed, explanation },
      audio:      { score, details, explanation },
      lipsync:    { score, details, explanation },
      rppg:       { score, details, explanation },
      provenance: { score, details, explanation },
    }
  }
```

## Performance Targets
- 10s video on CPU in ≤ 30s
- max_frames = 30 (hard cap in frame_extractor)
- DCT: column stride 16, every-3rd-frame sampling
- Noise: every-5th-frame sampling
- Audio: cap 100 FFT frames

## Things NOT yet implemented (future roadmap)
- Grad-CAM heatmap overlay on frames
- Ensemble ML model fallback (XceptionNet or EfficientNet)
- Real-time webcam stream mode
- PDF forensic report export
- Docker containerization
- Batch analysis mode
