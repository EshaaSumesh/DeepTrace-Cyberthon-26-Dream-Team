# DeepTrace — Deepfake Trust & Attribution System
> **Cyberthon'26 · Problem Statement 2 · SRM Institute of Science & Technology**

## 🎯 Problem Statement

Binary deepfake detection fails in the real world. Real content gets compressed, forwarded, edited, screen-recorded, and re-uploaded across platforms. A simple "fake / real" label is weak.

**DeepTrace** moves beyond binary classification by evaluating **media trustworthiness** through multi-channel forensic signal analysis, provenance reconstruction, and biological anomaly detection.

---

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                      Media Upload                            │
└────────────────────────┬─────────────────────────────────────┘
                         │
             ┌───────────▼───────────┐
             │   Frame Extractor     │  ≤30 frames, uniform sampling
             └───────────┬───────────┘
                         │
    ┌────────────────────┼────────────────────┐
    │                    │                    │
    ▼                    ▼                    ▼
┌───────────┐    ┌───────────────┐   ┌──────────────┐
│  Video    │    │  Audio        │   │  Lip-Sync    │
│ Detector  │    │  Detector     │   │  Detector    │
│           │    │               │   │              │
│• DCT freq │    │• Spec.flatness│   │• Mouth ROI   │
│• Temporal │    │• Flux contin. │   │• Audio RMS   │
│• Noise FP │    │• Silence patt.│   │• Pearson ρ   │
└─────┬─────┘    └───────┬───────┘   └──────┬───────┘
      │                  │                  │
      ▼                  ▼                  ▼
┌──────────────┐  ┌──────────────────────────────┐
│  rPPG        │  │   Provenance Analyser         │
│  Detector    │  │                              │
│              │  │• Metadata completeness        │
│• Face detect │  │• Codec chain health           │
│• Green chan. │  │• Compression depth            │
│• FFT pulse   │  │  (via ffprobe)                │
└──────┬───────┘  └───────────────┬───────────────┘
       │                          │
       └──────────┬───────────────┘
                  ▼
         ┌────────────────┐
         │  Trust Scorer  │
         │                │
         │ Trust = 1 −    │
         │ [V×.40+A×.30   │
         │  +L×.10        │
         │  +(1−P)×.20]   │
         └────────┬───────┘
                  ▼
         ┌────────────────┐
         │  Risk Tier     │
         │ LOW / MEDIUM / │
         │ HIGH / CRITICAL│
         └────────┬───────┘
                  ▼
         Forensic Report + UI
```

---

## 📐 Trust Score Formula

```
Trust = 1 − [(Video × 0.40) + (Audio × 0.30) + (LipSync × 0.10) + ((1 − Prov) × 0.20)]
```

| Channel    | Weight | Signal |
|-----------|--------|--------|
| Video     | 40%    | DCT artifact score, temporal inconsistency, noise kurtosis |
| Audio     | 30%    | Spectral flatness (Wiener entropy), flux continuity, silence patterns |
| Lip-Sync  | 10%    | Pearson correlation of mouth motion vs. audio RMS energy |
| Provenance| 20%    | Metadata completeness, codec chain health, compression depth |

### Risk Tiers

| Trust Score | Risk Level |
|-------------|-----------|
| > 0.70      | 🟢 LOW |
| 0.50 – 0.70 | 🟡 MEDIUM |
| 0.30 – 0.50 | 🟠 HIGH |
| < 0.30      | 🔴 CRITICAL |

---

## 🚀 Quick Start

### Prerequisites
- Python 3.9+
- `ffmpeg` (for audio/provenance analysis)
- `ffprobe` (bundled with ffmpeg)

### Installation & Run

```bash
# Clone / unzip the project
cd deeptrace

# Install Python dependencies
pip install fastapi uvicorn[standard] python-multipart opencv-python-headless numpy scipy aiofiles

# Or use the run script
chmod +x run.sh
./run.sh

# Open browser
open http://localhost:8000
```

### API Usage

```bash
# Analyze a video file
curl -X POST http://localhost:8000/analyze \
  -F "file=@suspicious_video.mp4" | python3 -m json.tool
```

---

## 🔬 Forensic Detectors

### Video Detector
- **DCT Artifact Score**: GAN generators leave characteristic high-frequency energy in 8×8 DCT blocks (Durall et al., 2020). Computed on every 3rd frame, column-stride sampling for CPU performance.
- **Temporal Consistency**: Inter-frame local-variance coefficient of variation. Face-swap blending creates spatial inhomogeneity discontinuities.
- **Noise Fingerprint**: Camera sensor noise follows near-Gaussian distribution (kurtosis ≈ 3). GAN-generated images deviate significantly from this.

### Audio Detector
- **Spectral Flatness (Wiener Entropy)**: Natural speech has low flatness (0.05–0.25). Neural vocoders and TTS systems produce unnaturally flat spectra.
- **Spectral Flux Continuity**: Audio splicing creates isolated flux spikes detectable as high coefficient of variation.
- **Silence Patterns**: TTS concatenation creates many short, unnatural silence micro-segments between phonemes.

### Lip-Sync Detector
- Detects face using Haar cascade, crops mouth ROI (lower 40% of face bounding box).
- Computes frame-to-frame mean absolute pixel difference as mouth motion proxy.
- Extracts per-frame audio RMS energy via ffmpeg.
- Pearson correlation of the two series: low/negative → face-swap or dubbed audio.

### rPPG Detector
- Remote Photoplethysmography: forehead green-channel time series across sampled frames.
- Applies linear detrend, FFT power spectrum.
- Cardiac band SNR (0.7–3.5 Hz mapped to normalised frequency).
- Authentic faces → measurable pulse; synthetic faces → flat signal.

### Provenance Analyser
- Runs `ffprobe` to extract format/stream metadata.
- Scores metadata completeness (creation_time, encoder, GPS tags).
- Evaluates bitrate-per-pixel for codec chain quality.
- Estimates compression depth from total kbps vs duration.

---

## 📁 Project Structure

```
deeptrace/
├── backend/
│   ├── main.py                    ← FastAPI application
│   ├── requirements.txt
│   └── pipeline/
│       ├── frame_extractor.py     ← Uniform frame sampling
│       ├── video_detector.py      ← DCT + temporal + noise
│       ├── audio_detector.py      ← Spectral flatness + flux
│       ├── lipsync_detector.py    ← Mouth-audio correlation
│       ├── rppg_detector.py       ← Biological pulse signal
│       ├── provenance_analyzer.py ← Metadata archaeology
│       └── trust_scorer.py        ← Weighted formula + risk tier
├── frontend/
│   └── index.html                 ← Dark-theme forensic UI
├── run.sh                         ← Quick-start script
└── README.md
```

---

## ⚡ Performance

| Metric | Target | Implementation |
|--------|--------|----------------|
| 10-second video processing | ≤ 30s CPU | Max 30 frames; column-stride DCT; every-3rd/5th frame sub-sampling |
| Frame count | ≤ 30 | Uniform sampling enforced in frame_extractor.py |
| Audio analysis | ≤ 8s | Cap at 100 FFT frames; 16 kHz mono |
| Provenance | ≤ 3s | Single ffprobe call with JSON output |

---

## 🏆 Team
*(Team members – fill in)*

**Track**: AI/ML Security  
**Event**: Cyberthon'26 @ SRM Institute of Science & Technology, Chennai Ramapuram
