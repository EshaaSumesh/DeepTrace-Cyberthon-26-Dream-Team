"""
DeepTrace — URL / Stream Analyzer
Downloads media from a URL using yt-dlp (YouTube, TikTok, Twitter/X,
Instagram, Vimeo, direct .mp4/.mp3 links) then runs the forensic pipeline.

Falls back gracefully if yt-dlp is unavailable: tries urllib direct download
for bare media URLs (ending in known extensions).
"""
import os
import re
import tempfile
import subprocess
import urllib.request
import urllib.parse
from pathlib import Path
from typing import Optional, Tuple

_DIRECT_EXTS = {
    ".mp4", ".avi", ".mov", ".mkv", ".webm",
    ".mp3", ".wav", ".flac", ".m4a", ".ogg",
}

_MAX_BYTES = 200 * 1024 * 1024   # 200 MB hard cap


def download_url(url: str) -> Tuple[str, str]:
    """
    Download media from `url` to a temp file.

    Returns:
        (tmp_path, original_filename)

    Raises:
        ValueError  — unsupported URL or download failed
        RuntimeError — file exceeds size cap
    """
    url = url.strip()
    if not url:
        raise ValueError("URL is empty.")

    # Sanitise
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise ValueError(f"Only http/https URLs are supported (got '{parsed.scheme}').")

    # Check if it's a direct media link
    path_ext = Path(parsed.path).suffix.lower()
    if path_ext in _DIRECT_EXTS:
        return _download_direct(url, path_ext)

    # Otherwise try yt-dlp
    return _download_ytdlp(url)


def _download_direct(url: str, ext: str) -> Tuple[str, str]:
    """Stream-download a bare media URL with a size cap."""
    with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
        tmp_path = tmp.name

    try:
        req = urllib.request.Request(url, headers={"User-Agent": "DeepTrace/1.0"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            total = 0
            with open(tmp_path, "wb") as out:
                while True:
                    chunk = resp.read(65536)
                    if not chunk:
                        break
                    total += len(chunk)
                    if total > _MAX_BYTES:
                        raise RuntimeError(f"Download exceeded {_MAX_BYTES//1024//1024} MB limit.")
                    out.write(chunk)

        fname = Path(urllib.parse.urlparse(url).path).name or f"media{ext}"
        return tmp_path, fname

    except RuntimeError:
        _cleanup(tmp_path)
        raise
    except Exception as exc:
        _cleanup(tmp_path)
        raise ValueError(f"Direct download failed: {exc}") from exc


def _download_ytdlp(url: str) -> Tuple[str, str]:
    """Use yt-dlp to download the best available short video."""
    # Check yt-dlp is available
    try:
        subprocess.run(
            ["yt-dlp", "--version"],
            capture_output=True, timeout=5, check=True,
        )
    except (FileNotFoundError, subprocess.CalledProcessError):
        raise ValueError(
            "yt-dlp is not installed. Install with: pip install yt-dlp\n"
            "Alternatively, paste a direct media URL (.mp4, .mp3, etc.)"
        )

    with tempfile.TemporaryDirectory() as tmpdir:
        out_tmpl = os.path.join(tmpdir, "media.%(ext)s")

        cmd = [
            "yt-dlp",
            "--no-playlist",
            "--max-filesize", "200m",
            # Prefer short-format video ≤ 720p for CPU speed
            "-f", "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best",
            "-o", out_tmpl,
            "--no-warnings",
            "--quiet",
            url,
        ]

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)

        if result.returncode != 0:
            err = result.stderr.strip()
            raise ValueError(f"yt-dlp failed: {err or 'unknown error'}")

        # Find the downloaded file
        candidates = list(Path(tmpdir).glob("media.*"))
        if not candidates:
            raise ValueError("yt-dlp ran successfully but no output file was found.")

        downloaded = candidates[0]
        suffix     = downloaded.suffix.lower()

        # Copy to a persistent temp file (tmpdir will be deleted)
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as out:
            out_path = out.name

        import shutil
        shutil.copy2(str(downloaded), out_path)

        # Derive filename from URL domain + title slug
        domain = urllib.parse.urlparse(url).netloc.replace("www.", "")
        fname  = f"{domain}_media{suffix}"

        return out_path, fname


def _cleanup(path: Optional[str]):
    if path and os.path.exists(path):
        try:
            os.unlink(path)
        except OSError:
            pass
