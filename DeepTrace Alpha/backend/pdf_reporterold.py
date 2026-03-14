"""
DeepTrace — Forensic PDF Report Generator
Produces a professional multi-page PDF report from an analysis result dict.
Uses reportlab Platypus (flowable layout engine).

Layout:
  Page 1 — Cover: DeepTrace branding, filename, trust score, risk badge
  Page 2 — Executive Summary: score breakdown table, risk description
  Page 3+ — Detector Details: per-detector findings, explanations
  Last page — Technical Appendix: formula, methodology notes
"""
import io
import base64
import datetime
from typing import Any, Dict, List, Optional

from reportlab.lib.pagesizes     import A4
from reportlab.lib.units         import mm, cm
from reportlab.lib               import colors
from reportlab.lib.styles        import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums         import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.platypus          import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, PageBreak, Image, KeepTogether,
)
from reportlab.platypus.flowables import BalancedColumns
from reportlab.pdfgen             import canvas as pdfgen_canvas

# ── Colour palette matching UI ──────────────────────────────────────────────
_BG       = colors.HexColor("#070c18")
_ACCENT   = colors.HexColor("#00d4ff")
_ACCENT2  = colors.HexColor("#7c3aed")
_TEXT0    = colors.HexColor("#e8f0fe")
_TEXT1    = colors.HexColor("#94a3b8")
_LOW      = colors.HexColor("#22c55e")
_MEDIUM   = colors.HexColor("#f59e0b")
_HIGH     = colors.HexColor("#f97316")
_CRITICAL = colors.HexColor("#ef4444")
_BG2      = colors.HexColor("#131b30")
_BG3      = colors.HexColor("#1c2540")
_WHITE    = colors.white
_BLACK    = colors.black

_PAGE_W, _PAGE_H = A4
_MARGIN          = 18 * mm


def _risk_color(level: str) -> colors.Color:
    return {"LOW": _LOW, "MEDIUM": _MEDIUM, "HIGH": _HIGH, "CRITICAL": _CRITICAL}.get(level, _TEXT1)


# ── Custom page template ─────────────────────────────────────────────────────
class _DeepTraceCanvas(pdfgen_canvas.Canvas):
    """Adds header bar and page-number footer to every page."""

    def __init__(self, *args, report_meta: Dict = None, **kwargs):
        super().__init__(*args, **kwargs)
        self._meta = report_meta or {}

    def showPage(self):
        self._draw_chrome()
        super().showPage()

    def save(self):
        self._draw_chrome()
        super().save()

    def _draw_chrome(self):
        w, h = self._pagesize
        # Top bar
        self.setFillColor(_BG)
        self.rect(0, h - 14*mm, w, 14*mm, fill=1, stroke=0)
        self.setFillColor(_ACCENT)
        self.setFont("Helvetica-Bold", 8)
        self.drawString(18*mm, h - 8*mm, "DeepTrace — Deepfake Trust & Attribution System")
        self.setFillColor(_TEXT1)
        self.setFont("Helvetica", 7)
        ts = self._meta.get("generated_at", "")
        self.drawRightString(w - 18*mm, h - 8*mm, ts)

        # Bottom bar
        self.setFillColor(_BG)
        self.rect(0, 0, w, 10*mm, fill=1, stroke=0)
        self.setFillColor(_TEXT1)
        self.setFont("Helvetica", 7)
        self.drawString(18*mm, 3.5*mm, f"Cyberthon'26 · SRM IST Chennai Ramapuram · PS-02 AI/ML Security")
        self.drawRightString(w - 18*mm, 3.5*mm, f"Page {self._pageNumber}")


# ── Style sheet ──────────────────────────────────────────────────────────────
def _build_styles():
    base = getSampleStyleSheet()

    def S(name, **kw):
        return ParagraphStyle(name, parent=base["Normal"], **kw)

    return {
        "cover_title": S("cover_title",
            fontSize=34, textColor=_ACCENT, fontName="Helvetica-Bold",
            alignment=TA_CENTER, leading=40, spaceAfter=4),
        "cover_sub": S("cover_sub",
            fontSize=13, textColor=_TEXT1, fontName="Helvetica",
            alignment=TA_CENTER, leading=18, spaceAfter=2),
        "cover_filename": S("cover_filename",
            fontSize=11, textColor=_TEXT0, fontName="Helvetica-Bold",
            alignment=TA_CENTER, leading=16),
        "section_h": S("section_h",
            fontSize=13, textColor=_ACCENT, fontName="Helvetica-Bold",
            spaceBefore=8, spaceAfter=4, leading=16),
        "sub_h": S("sub_h",
            fontSize=10, textColor=_TEXT0, fontName="Helvetica-Bold",
            spaceBefore=4, spaceAfter=3, leading=14),
        "body": S("body",
            fontSize=9, textColor=_TEXT0, fontName="Helvetica",
            leading=14, spaceAfter=4),
        "body_dim": S("body_dim",
            fontSize=8.5, textColor=_TEXT1, fontName="Helvetica",
            leading=13, spaceAfter=3),
        "mono": S("mono",
            fontSize=7.5, textColor=_ACCENT, fontName="Courier",
            leading=12, spaceAfter=2, backColor=_BG2,
            leftIndent=4, rightIndent=4),
        "risk_label": S("risk_label",
            fontSize=22, fontName="Helvetica-Bold",
            alignment=TA_CENTER, leading=28),
        "score_big": S("score_big",
            fontSize=42, fontName="Helvetica-Bold",
            textColor=_ACCENT, alignment=TA_CENTER, leading=52),
        "table_hdr": S("table_hdr",
            fontSize=8, textColor=_TEXT1, fontName="Helvetica-Bold",
            alignment=TA_CENTER),
        "table_cell": S("table_cell",
            fontSize=8.5, textColor=_TEXT0, fontName="Helvetica",
            alignment=TA_CENTER),
        "table_cell_l": S("table_cell_l",
            fontSize=8.5, textColor=_TEXT0, fontName="Helvetica",
            alignment=TA_LEFT),
        "caption": S("caption",
            fontSize=7.5, textColor=_TEXT1, fontName="Helvetica-Oblique",
            alignment=TA_CENTER, spaceAfter=6),
    }


# ── Public API ───────────────────────────────────────────────────────────────
def generate_pdf(result: Dict[str, Any]) -> bytes:
    """
    Accept a DeepTrace /analyze result dict and return a complete PDF as bytes.
    """
    buf    = io.BytesIO()
    styles = _build_styles()
    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M UTC")

    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=_MARGIN, rightMargin=_MARGIN,
        topMargin=20*mm, bottomMargin=16*mm,
    )

    story: List = []

    _add_cover(story, styles, result, now_str)
    story.append(PageBreak())
    _add_executive_summary(story, styles, result)
    story.append(PageBreak())
    _add_detector_details(story, styles, result)
    story.append(PageBreak())
    _add_technical_appendix(story, styles, result)

    meta = {"generated_at": now_str}

    def canvas_maker(filename, doc):
        return _DeepTraceCanvas(filename, pagesize=A4, report_meta=meta)

    doc.build(story, canvasmaker=canvas_maker)
    return buf.getvalue()


# ── Page builders ─────────────────────────────────────────────────────────────

def _add_cover(story, styles, result, now_str):
    trust   = result.get("trust_score", 0)
    risk    = result.get("risk_level", "UNKNOWN")
    fname   = result.get("filename", "unknown")
    rc      = _risk_color(risk)
    pct     = f"{trust * 100:.1f}"

    story += [
        Spacer(1, 18*mm),
        Paragraph("DeepTrace", styles["cover_title"]),
        Paragraph("Deepfake Trust &amp; Attribution System", styles["cover_sub"]),
        Spacer(1, 6*mm),
        HRFlowable(width="80%", thickness=1, color=_BG3, spaceAfter=8*mm),

        # Big score
        Paragraph(f"{pct}%", ParagraphStyle("big_score",
            parent=styles["score_big"], textColor=rc)),
        Paragraph("TRUST SCORE", styles["cover_sub"]),
        Spacer(1, 3*mm),

        # Risk badge (table trick for background)
        _risk_badge_table(risk, rc, styles),
        Spacer(1, 10*mm),

        HRFlowable(width="60%", thickness=1, color=_BG3, spaceBefore=2*mm, spaceAfter=6*mm),

        Paragraph(f"File: {fname}", styles["cover_filename"]),
        Paragraph(
            f"Duration: {result.get('duration_s','?')}s &nbsp;|&nbsp; "
            f"Frames sampled: {result.get('frames_sampled','?')} &nbsp;|&nbsp; "
            f"Processed in: {result.get('processing_time_s','?')}s",
            styles["body_dim"],
        ),
        Spacer(1, 4*mm),
        Paragraph(f"Generated: {now_str}", styles["body_dim"]),
        Spacer(1, 6*mm),
        Paragraph(
            "<b>CONFIDENTIAL FORENSIC REPORT</b> — This report was automatically generated by "
            "DeepTrace. It is intended for forensic reference only and does not constitute legal evidence. "
            "All analysis is based on signal-level heuristics without ML model dependency.",
            ParagraphStyle("disc", parent=styles["body_dim"], alignment=TA_CENTER),
        ),
    ]


def _risk_badge_table(risk, color, styles):
    label_para = Paragraph(
        f"<b>{risk} RISK</b>",
        ParagraphStyle("rb", parent=styles["body"],
            textColor=color, fontSize=14, alignment=TA_CENTER, leading=18),
    )
    t = Table([[label_para]], colWidths=[80*mm])
    t.setStyle(TableStyle([
        ("BACKGROUND",  (0,0), (-1,-1), colors.HexColor("#131b30")),
        ("ROUNDEDCORNERS", [6]),
        ("BOX",         (0,0), (-1,-1), 1.5, color),
        ("TOPPADDING",  (0,0), (-1,-1), 6),
        ("BOTTOMPADDING",(0,0),(-1,-1), 6),
        ("ALIGN",       (0,0), (-1,-1), "CENTER"),
    ]))
    # Wrap in a centered table
    outer = Table([[t]], colWidths=[_PAGE_W - 2*_MARGIN])
    outer.setStyle(TableStyle([("ALIGN", (0,0), (-1,-1), "CENTER")]))
    return outer


def _add_executive_summary(story, styles, result):
    trust  = result.get("trust_score", 0)
    manip  = result.get("manipulation_score", 0)
    risk   = result.get("risk_level", "UNKNOWN")
    rc     = _risk_color(risk)
    bd     = result.get("score_breakdown", {})
    dets   = result.get("detectors", {})

    story.append(Paragraph("Executive Summary", styles["section_h"]))
    story.append(HRFlowable(width="100%", thickness=0.5, color=_BG3, spaceAfter=4*mm))

    # Key metrics row
    metrics = [
        ("Trust Score",       f"{trust*100:.1f}%",  _ACCENT),
        ("Manipulation",      f"{manip*100:.1f}%",  rc),
        ("Risk Level",        risk,                 rc),
        ("File Size",         f"{result.get('file_size_mb','?')} MB", _TEXT1),
        ("Processing Time",   f"{result.get('processing_time_s','?')}s", _TEXT1),
    ]
    metric_cells = []
    for label, val, col in metrics:
        cell = [
            Paragraph(val, ParagraphStyle("mv", parent=styles["body"],
                fontSize=16, fontName="Helvetica-Bold", textColor=col,
                alignment=TA_CENTER, leading=20)),
            Paragraph(label, ParagraphStyle("ml", parent=styles["body_dim"],
                alignment=TA_CENTER, fontSize=7.5)),
        ]
        metric_cells.append(cell)

    # Chunk into 3 + 2
    def metric_table(cells, col_count):
        t = Table([cells], colWidths=[(_PAGE_W - 2*_MARGIN) / col_count] * col_count)
        t.setStyle(TableStyle([
            ("BACKGROUND",   (0,0), (-1,-1), _BG2),
            ("BOX",          (0,0), (-1,-1), 0.5, _BG3),
            ("INNERGRID",    (0,0), (-1,-1), 0.5, _BG3),
            ("TOPPADDING",   (0,0), (-1,-1), 6),
            ("BOTTOMPADDING",(0,0), (-1,-1), 6),
            ("ALIGN",        (0,0), (-1,-1), "CENTER"),
        ]))
        return t

    story.append(metric_table(metric_cells[:3], 3))
    story.append(Spacer(1, 2*mm))
    story.append(metric_table(metric_cells[3:], 2))
    story.append(Spacer(1, 6*mm))

    # Risk description
    story.append(Paragraph("Risk Assessment", styles["sub_h"]))
    story.append(Paragraph(result.get("risk_description", ""), styles["body"]))
    story.append(Spacer(1, 5*mm))

    # Score breakdown table
    story.append(Paragraph("Score Decomposition", styles["sub_h"]))
    story.append(Paragraph(
        "Trust = 1 &minus; [Video &times; 0.40 + Audio &times; 0.30 + LipSync &times; 0.10 + (1 &minus; Prov) &times; 0.20]",
        styles["mono"],
    ))
    story.append(Spacer(1, 3*mm))

    hdr = ["Channel", "Weight", "Raw Score", "Contribution", "Signal"]
    rows = [hdr]
    chan_info = [
        ("Video",      "×0.40", dets.get("video",{}),      bd.get("video_contribution",0),      "DCT artifacts · temporal · noise"),
        ("Audio",      "×0.30", dets.get("audio",{}),      bd.get("audio_contribution",0),      "Spectral flatness · flux · silence"),
        ("Lip-Sync",   "×0.10", dets.get("lipsync",{}),    bd.get("lipsync_contribution",0),    "Pearson ρ mouth ↔ audio RMS"),
        ("Provenance", "×0.20 inv", dets.get("provenance",{}), bd.get("provenance_contribution",0),"Metadata · codec · compression"),
    ]
    for name, wt, det, contrib, signal in chan_info:
        raw = det.get("score", 0)
        rows.append([name, wt, f"{raw*100:.1f}%", f"{contrib*100:.2f}%", signal])

    cw = [30*mm, 22*mm, 22*mm, 26*mm, None]
    avail = _PAGE_W - 2*_MARGIN - sum(x for x in cw if x)
    cw[-1] = avail

    tbl = Table(rows, colWidths=cw, repeatRows=1)
    tbl_style = [
        ("BACKGROUND",    (0,0), (-1,0),  _BG3),
        ("TEXTCOLOR",     (0,0), (-1,0),  _TEXT1),
        ("FONTNAME",      (0,0), (-1,0),  "Helvetica-Bold"),
        ("FONTSIZE",      (0,0), (-1,-1), 8.5),
        ("BACKGROUND",    (0,1), (-1,-1), _BG2),
        ("ROWBACKGROUNDS",(0,1), (-1,-1), [_BG2, _BG]),
        ("TEXTCOLOR",     (0,1), (-1,-1), _TEXT0),
        ("FONTNAME",      (0,1), (-1,-1), "Helvetica"),
        ("ALIGN",         (1,0), (3,-1),  "CENTER"),
        ("ALIGN",         (0,0), (0,-1),  "LEFT"),
        ("ALIGN",         (4,0), (4,-1),  "LEFT"),
        ("GRID",          (0,0), (-1,-1), 0.3, _BG3),
        ("TOPPADDING",    (0,0), (-1,-1), 5),
        ("BOTTOMPADDING", (0,0), (-1,-1), 5),
        ("LEFTPADDING",   (0,0), (-1,-1), 6),
    ]
    tbl.setStyle(TableStyle(tbl_style))
    story.append(tbl)


def _add_detector_details(story, styles, result):
    dets = result.get("detectors", {})
    hotspot = result.get("heatmaps", {}).get("hotspot_description", "")

    story.append(Paragraph("Detector Analysis", styles["section_h"]))
    story.append(HRFlowable(width="100%", thickness=0.5, color=_BG3, spaceAfter=4*mm))

    icons = {"video":"[VIDEO]","audio":"[AUDIO]","lipsync":"[LIPSYNC]","rppg":"[rPPG]","provenance":"[PROV]"}
    full_names = {
        "video":      "Video Forensics — DCT, Temporal, Noise",
        "audio":      "Audio Forensics — Spectral Flatness, Flux, Silence",
        "lipsync":    "Lip-Sync Correlation — Pearson Mouth-Audio",
        "rppg":       "rPPG Biological Signal — Cardiac Pulse Detection",
        "provenance": "Provenance Chain — Metadata, Codec, Compression",
    }

    for key in ["video","audio","lipsync","rppg","provenance"]:
        det   = dets.get(key, {})
        score = det.get("score", 0)
        rc    = _risk_color(_score_to_risk(score, key=="provenance"))

        # Header row with score
        hdr_data = [[
            Paragraph(f"<b>{full_names[key]}</b>", styles["sub_h"]),
            Paragraph(
                f"<b>{score*100:.1f}%</b>",
                ParagraphStyle("ds", parent=styles["body"],
                    textColor=rc, fontSize=13, fontName="Helvetica-Bold",
                    alignment=TA_RIGHT, leading=16),
            ),
        ]]
        hdr_t = Table(hdr_data, colWidths=[120*mm, None])
        hdr_t.setStyle(TableStyle([
            ("BACKGROUND", (0,0), (-1,-1), _BG2),
            ("BOX",        (0,0), (-1,-1), 0.5, rc),
            ("LEFTPADDING",(0,0), (-1,-1), 8),
            ("RIGHTPADDING",(0,0),(-1,-1), 8),
            ("TOPPADDING", (0,0), (-1,-1), 5),
            ("BOTTOMPADDING",(0,0),(-1,-1), 5),
            ("VALIGN",     (0,0), (-1,-1), "MIDDLE"),
        ]))
        story.append(hdr_t)

        # Details sub-table
        details = det.get("details", {})
        if details:
            sub_rows = [[Paragraph(str(k).replace("_"," ").title(), styles["body_dim"]),
                         Paragraph(str(v), styles["body"])]
                        for k,v in details.items() if k not in ("note",)]
            if sub_rows:
                dt = Table(sub_rows, colWidths=[60*mm, None])
                dt.setStyle(TableStyle([
                    ("BACKGROUND",   (0,0), (-1,-1), _BG),
                    ("TEXTCOLOR",    (0,0), (-1,-1), _TEXT1),
                    ("FONTSIZE",     (0,0), (-1,-1), 8),
                    ("TOPPADDING",   (0,0), (-1,-1), 3),
                    ("BOTTOMPADDING",(0,0), (-1,-1), 3),
                    ("LEFTPADDING",  (0,0), (-1,-1), 8),
                    ("LINEBELOW",    (0,0), (-1,-2), 0.2, _BG3),
                ]))
                story.append(dt)

        # Explanation
        expl = det.get("explanation", "")
        if expl:
            story.append(Paragraph(expl, styles["body_dim"]))

        story.append(Spacer(1, 5*mm))

    # Heatmap note
    if hotspot:
        story.append(Paragraph("Saliency Heatmap Summary", styles["sub_h"]))
        story.append(Paragraph(hotspot, styles["body"]))

    # Forensic report verbatim
    story.append(Spacer(1, 4*mm))
    story.append(Paragraph("Forensic Analysis Report (Verbatim)", styles["sub_h"]))
    report_text = result.get("forensic_explanation", "")
    for line in report_text.split("\n"):
        safe = line.replace("&","&amp;").replace("<","&lt;").replace(">","&gt;")
        story.append(Paragraph(safe or "&nbsp;", styles["mono"]))


def _add_technical_appendix(story, styles, result):
    story.append(Paragraph("Technical Appendix", styles["section_h"]))
    story.append(HRFlowable(width="100%", thickness=0.5, color=_BG3, spaceAfter=4*mm))

    story.append(Paragraph("Trust Score Formula", styles["sub_h"]))
    story.append(Paragraph(
        "Trust = 1 &minus; [(Video &times; 0.40) + (Audio &times; 0.30) + (LipSync &times; 0.10) + ((1 &minus; Prov) &times; 0.20)]",
        styles["mono"],
    ))
    story.append(Spacer(1, 3*mm))

    story.append(Paragraph("Risk Tier Thresholds", styles["sub_h"]))
    tier_data = [
        ["Risk Level", "Trust Score Range", "Interpretation"],
        ["LOW",      "> 0.70",     "Media appears authentic across all forensic channels"],
        ["MEDIUM",   "0.50 – 0.70","Some manipulation indicators; recommend manual review"],
        ["HIGH",     "0.30 – 0.50","Multiple signals; likely synthetic or significantly edited"],
        ["CRITICAL", "< 0.30",     "Strong multi-channel evidence of deepfake manipulation"],
    ]
    tier_colors = [_BG3, _LOW, _MEDIUM, _HIGH, _CRITICAL]
    t = Table(tier_data, colWidths=[30*mm, 35*mm, None])
    ts_style = [
        ("FONTSIZE",      (0,0), (-1,-1), 8.5),
        ("BACKGROUND",    (0,0), (-1,0),  _BG3),
        ("TEXTCOLOR",     (0,0), (-1,0),  _TEXT1),
        ("FONTNAME",      (0,0), (-1,0),  "Helvetica-Bold"),
        ("TEXTCOLOR",     (0,1), (-1,-1), _TEXT0),
        ("FONTNAME",      (0,1), (-1,-1), "Helvetica"),
        ("TOPPADDING",    (0,0), (-1,-1), 5),
        ("BOTTOMPADDING", (0,0), (-1,-1), 5),
        ("LEFTPADDING",   (0,0), (-1,-1), 6),
        ("GRID",          (0,0), (-1,-1), 0.3, _BG3),
    ]
    for i, col in enumerate(tier_colors[1:], start=1):
        ts_style.append(("TEXTCOLOR", (0,i), (0,i), col))
        ts_style.append(("FONTNAME",  (0,i), (0,i), "Helvetica-Bold"))
    t.setStyle(TableStyle(ts_style))
    story.append(t)
    story.append(Spacer(1, 5*mm))

    story.append(Paragraph("Detector Methodology", styles["sub_h"]))
    methods = [
        ("Video — DCT Artifact Score",
         "GAN generators produce characteristic high-frequency energy in 8×8 DCT blocks. "
         "We compute HF-quadrant / total energy ratio per block, calibrated against natural video baselines "
         "(natural ≈ 0.08–0.12; GAN output ≈ 0.18+). Reference: Durall et al. (2020)."),
        ("Video — Temporal Consistency",
         "Face-swap blending introduces spatial inhomogeneity discontinuities between consecutive frames. "
         "We measure the coefficient of variation of per-region pixel variance across a 4×4 grid."),
        ("Video — Noise Fingerprint",
         "Camera sensor noise follows a near-Gaussian distribution (kurtosis ≈ 3). "
         "GAN-generated images exhibit non-Gaussian residual noise. "
         "We compute excess kurtosis of Gaussian-subtracted residuals."),
        ("Audio — Spectral Flatness",
         "Wiener entropy (geometric/arithmetic mean of spectrum) is 0.05–0.25 in natural speech "
         "and 0.35–0.70 in neural vocoder / TTS output. Reference: Mazen & Evans (2022)."),
        ("Audio — Spectral Flux",
         "Audio splicing creates isolated spectral flux spikes detectable as elevated coefficient "
         "of variation across short-time spectral frames."),
        ("Lip-Sync Correlation",
         "Pearson correlation between mouth-region optical motion (mean abs pixel diff, Haar-cascade ROI) "
         "and per-frame audio RMS energy. Low/negative correlation indicates face-swap or audio replacement."),
        ("rPPG Biological Signal",
         "Remote photoplethysmography extracts cardiac pulse from forehead green-channel micro-variations. "
         "Authentic faces show measurable SNR in the 0.7–3.5 Hz cardiac band. "
         "Synthetic faces produce flat signals. Reference: de Haan & Jeanne (2013)."),
        ("Provenance — Metadata",
         "Deepfake distribution typically strips creation_time, GPS, and encoder tags. "
         "Impossible timestamps receive negative scores."),
        ("Provenance — Compression Depth",
         "Total bitrate (kbps) is used to estimate compression generation count. "
         "Multiple re-encode cycles reduce effective bitrate toward zero."),
    ]
    for title, body in methods:
        story.append(KeepTogether([
            Paragraph(f"<b>{title}</b>", ParagraphStyle("mh", parent=styles["body_dim"],
                fontSize=8.5, fontName="Helvetica-Bold", textColor=_ACCENT,
                spaceBefore=4, spaceAfter=1)),
            Paragraph(body, styles["body_dim"]),
        ]))

    story.append(Spacer(1, 6*mm))
    story.append(HRFlowable(width="100%", thickness=0.5, color=_BG3, spaceAfter=3*mm))
    story.append(Paragraph(
        "This report was generated by DeepTrace, a forensic deepfake analysis system built for "
        "Cyberthon'26 at SRM Institute of Science &amp; Technology, Chennai Ramapuram. "
        "All analysis uses signal-level heuristics and does not rely on trained neural network classifiers. "
        "Results should be reviewed by a qualified forensic analyst before use in any legal or "
        "investigative context.",
        ParagraphStyle("disc2", parent=styles["body_dim"], alignment=TA_CENTER),
    ))


def _score_to_risk(score: float, inverted: bool = False) -> str:
    """Convert a detector score to a risk level string (for colour coding)."""
    if inverted:
        score = 1.0 - score   # provenance: high score = good
    if score < 0.30: return "LOW"
    if score < 0.50: return "MEDIUM"
    if score < 0.70: return "HIGH"
    return "CRITICAL"
