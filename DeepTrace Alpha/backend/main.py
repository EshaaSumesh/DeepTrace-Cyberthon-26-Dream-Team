"""
DeepTrace — FastAPI Application  v2.0
Endpoints:
  GET  /               → frontend UI
  POST /analyze        → single file upload
  POST /analyze-url    → download URL then analyze
  POST /analyze-webcam → browser MediaRecorder blob
  POST /analyze-batch  → multiple files, returns list of results
  POST /report         → accepts analysis JSON, returns forensic PDF
  GET  /health         → service health
"""
import os, time, tempfile, json
from pathlib import Path
from typing  import List

from fastapi import FastAPI, File, UploadFile, HTTPException, Form
from fastapi.responses import HTMLResponse, JSONResponse, Response
from fastapi.middleware.cors import CORSMiddleware

from pipeline.frame_extractor    import extract_frames
from pipeline.video_detector     import analyze_video
from pipeline.audio_detector     import analyze_audio
from pipeline.lipsync_detector   import analyze_lipsync
from pipeline.rppg_detector      import analyze_rppg
from pipeline.provenance_analyzer import analyze_provenance
from pipeline.trust_scorer       import compute_trust_score
from pipeline.heatmap_generator  import generate_heatmaps
from pdf_reporter  import generate_pdf
from url_analyzer  import download_url

app = FastAPI(title="DeepTrace", version="2.0.0",
              description="Deepfake Trust & Attribution System — Cyberthon'26")
app.add_middleware(CORSMiddleware, allow_origins=["*"],
                   allow_methods=["*"], allow_headers=["*"])

_FRONTEND = Path(__file__).parent.parent / "frontend" / "index.html"
_ALLOWED_EXT = {".mp4",".avi",".mov",".mkv",".webm",".mp3",".wav",".flac",".m4a",".ogg"}
_MAX_MB = 200


def run_pipeline(tmp_path: str, filename: str, file_size_mb: float) -> dict:
    start = time.perf_counter()
    frames, fps, duration = extract_frames(tmp_path, max_frames=30)
    video_r      = analyze_video(frames)
    audio_r      = analyze_audio(tmp_path)
    lipsync_r    = analyze_lipsync(frames, tmp_path, fps)
    rppg_r       = analyze_rppg(frames)
    provenance_r = analyze_provenance(tmp_path)
    heatmap_r    = generate_heatmaps(frames, max_key_frames=4)
    trust_r      = compute_trust_score(
        video_r["score"], audio_r["score"],
        lipsync_r["score"], provenance_r["score"],
    )
    elapsed = round(time.perf_counter() - start, 2)
    return {
        "filename": filename, "file_size_mb": round(file_size_mb, 3),
        "duration_s": round(duration, 2), "fps": round(fps, 2),
        "frames_sampled": len(frames), "processing_time_s": elapsed,
        "trust_score": trust_r["trust_score"],
        "manipulation_score": trust_r["manipulation_score"],
        "risk_level": trust_r["risk_level"], "risk_color": trust_r["risk_color"],
        "risk_description": trust_r["risk_description"],
        "score_breakdown": trust_r["score_breakdown"],
        "forensic_explanation": trust_r["explanation"],
        "detectors": {"video":video_r,"audio":audio_r,"lipsync":lipsync_r,
                      "rppg":rppg_r,"provenance":provenance_r},
        "heatmaps": {
            "summary": heatmap_r.get("summary_heatmap"),
            "key_frames": heatmap_r.get("key_frames", []),
            "hotspot_description": heatmap_r.get("hotspot_description", ""),
        },
    }


def _save_upload(content: bytes, suffix: str) -> str:
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(content)
        return tmp.name


def _cleanup(path):
    if path and os.path.exists(path):
        try: os.unlink(path)
        except OSError: pass


@app.get("/", response_class=HTMLResponse, include_in_schema=False)
async def serve_frontend():
    try: return _FRONTEND.read_text(encoding="utf-8")
    except FileNotFoundError: return HTMLResponse("<h1>DeepTrace API running</h1>")


@app.post("/analyze")
async def analyze_media(file: UploadFile = File(...)):
    filename = file.filename or "upload.mp4"
    suffix   = Path(filename).suffix.lower()
    if suffix not in _ALLOWED_EXT:
        raise HTTPException(400, f"Unsupported type '{suffix}'.")
    content = await file.read()
    size_mb = len(content) / 1e6
    if size_mb > _MAX_MB:
        raise HTTPException(413, f"File too large ({size_mb:.0f} MB).")
    tmp_path = None
    try:
        tmp_path = _save_upload(content, suffix)
        return run_pipeline(tmp_path, filename, size_mb)
    except HTTPException: raise
    except Exception as exc: raise HTTPException(500, f"Pipeline error: {exc}")
    finally: _cleanup(tmp_path)


@app.post("/analyze-url")
async def analyze_from_url(url: str = Form(...)):
    if not url.strip(): raise HTTPException(400, "URL is required.")
    tmp_path = None
    try:
        tmp_path, filename = download_url(url)
        size_mb = os.path.getsize(tmp_path) / 1e6
        return run_pipeline(tmp_path, filename, size_mb)
    except (ValueError, RuntimeError) as exc: raise HTTPException(400, str(exc))
    except Exception as exc: raise HTTPException(500, f"URL error: {exc}")
    finally: _cleanup(tmp_path)


@app.post("/analyze-webcam")
async def analyze_webcam(file: UploadFile = File(...)):
    content = await file.read()
    size_mb = len(content) / 1e6
    if size_mb > 50: raise HTTPException(413, "Clip too large (max 50 MB).")
    ct     = file.content_type or ""
    suffix = ".mp4" if "mp4" in ct else (".ogg" if "ogg" in ct else ".webm")
    tmp_path = None
    try:
        tmp_path = _save_upload(content, suffix)
        return run_pipeline(tmp_path, f"webcam_capture{suffix}", size_mb)
    except Exception as exc: raise HTTPException(500, f"Webcam error: {exc}")
    finally: _cleanup(tmp_path)


@app.post("/analyze-batch")
async def analyze_batch(files: List[UploadFile] = File(...)):
    if not files: raise HTTPException(400, "No files provided.")
    if len(files) > 10: raise HTTPException(400, "Batch limited to 10 files.")
    results = []
    for file in files:
        filename = file.filename or "upload.mp4"
        suffix   = Path(filename).suffix.lower()
        if suffix not in _ALLOWED_EXT:
            results.append({"filename": filename, "error": f"Unsupported type '{suffix}'"}); continue
        content = await file.read()
        size_mb = len(content) / 1e6
        if size_mb > _MAX_MB:
            results.append({"filename": filename, "error": f"Too large ({size_mb:.0f} MB)"}); continue
        tmp_path = None
        try:
            tmp_path = _save_upload(content, suffix)
            r = run_pipeline(tmp_path, filename, size_mb)
            r["heatmaps"] = {"hotspot_description": r["heatmaps"]["hotspot_description"],
                             "summary": None, "key_frames": []}
            results.append(r)
        except Exception as exc:
            results.append({"filename": filename, "error": str(exc)})
        finally: _cleanup(tmp_path)
    return {"batch_results": results, "total": len(results)}


@app.post("/report")
async def generate_report(request_body: dict):
    try:
        pdf_bytes = generate_pdf(request_body)
        filename  = request_body.get("filename", "media").rsplit(".", 1)[0]
        safe      = "".join(c if c.isalnum() or c in "-_" else "_" for c in filename)
        return Response(content=pdf_bytes, media_type="application/pdf",
                        headers={"Content-Disposition": f'attachment; filename="DeepTrace_{safe}.pdf"'})
    except Exception as exc: raise HTTPException(500, f"PDF error: {exc}")


@app.get("/health")
async def health():
    return {"status": "ok", "service": "DeepTrace", "version": "2.0.0"}
