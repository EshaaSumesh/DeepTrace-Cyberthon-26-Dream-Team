"""
DeepTrace — Trust Scorer
Implements the canonical DeepTrace trust formula:

    Trust = 1 − [(Video × 0.40) + (Audio × 0.30) + (LipSync × 0.10) + ((1 − Prov) × 0.20)]

Where:
    Video, Audio, LipSync  — manipulation probability  ∈ [0, 1]
    Prov                   — provenance authenticity    ∈ [0, 1]
    Trust                  — media trustworthiness      ∈ [0, 1]

Risk Tiers:
    LOW      > 0.70
    MEDIUM   0.50 – 0.70
    HIGH     0.30 – 0.50
    CRITICAL < 0.30
"""
from typing import Dict, Any


# ──────────────────────────────────────────────────────────────────────────────
# Weights (must sum to 1.0)
# ──────────────────────────────────────────────────────────────────────────────
_W_VIDEO    = 0.40
_W_AUDIO    = 0.30
_W_LIPSYNC  = 0.10
_W_PROV     = 0.20

_RISK_TIERS = [
    (0.70, "LOW",      "#22c55e", "Media appears authentic with strong trustworthiness signals across all forensic channels."),
    (0.50, "MEDIUM",   "#f59e0b", "Some manipulation indicators detected. Recommend manual review before publication or legal use."),
    (0.30, "HIGH",     "#f97316", "Multiple manipulation signals detected. Media is likely synthetic or has been significantly edited."),
    (0.00, "CRITICAL", "#ef4444", "Strong evidence of deepfake manipulation across multiple independent forensic channels. Do not trust."),
]


# ──────────────────────────────────────────────────────────────────────────────
# Public API
# ──────────────────────────────────────────────────────────────────────────────

def compute_trust_score(
    video_score:      float,
    audio_score:      float,
    lipsync_score:    float,
    provenance_score: float,
) -> Dict[str, Any]:
    """
    Compute the final DeepTrace trust score and classify risk tier.

    All detector scores are assumed to be manipulation probability ∈ [0, 1].
    provenance_score is authenticity ∈ [0, 1], so it is inverted inside the formula.
    """
    # Clamp inputs
    v  = max(0.0, min(1.0, float(video_score)))
    a  = max(0.0, min(1.0, float(audio_score)))
    ls = max(0.0, min(1.0, float(lipsync_score)))
    p  = max(0.0, min(1.0, float(provenance_score)))

    manipulation = (
        v  * _W_VIDEO   +
        a  * _W_AUDIO   +
        ls * _W_LIPSYNC +
        (1.0 - p) * _W_PROV
    )

    trust = max(0.0, min(1.0, 1.0 - manipulation))

    # Determine risk tier
    risk_level, risk_color, risk_desc = "CRITICAL", "#ef4444", _RISK_TIERS[-1][3]
    for threshold, level, color, desc in _RISK_TIERS:
        if trust > threshold:
            risk_level, risk_color, risk_desc = level, color, desc
            break

    breakdown = {
        "video_contribution":       round(v  * _W_VIDEO,        4),
        "audio_contribution":       round(a  * _W_AUDIO,        4),
        "lipsync_contribution":     round(ls * _W_LIPSYNC,      4),
        "provenance_contribution":  round((1.0 - p) * _W_PROV,  4),
    }

    return {
        "trust_score":       round(trust, 4),
        "manipulation_score":round(manipulation, 4),
        "risk_level":        risk_level,
        "risk_color":        risk_color,
        "risk_description":  risk_desc,
        "explanation":       _forensic_report(trust, v, a, ls, p, breakdown),
        "score_breakdown":   breakdown,
    }


# ──────────────────────────────────────────────────────────────────────────────
# Forensic explanation
# ──────────────────────────────────────────────────────────────────────────────

def _forensic_report(
    trust: float,
    v: float, a: float, ls: float, p: float,
    breakdown: Dict,
) -> str:
    lines = [
        "╔═══════════════════════════════════════════╗",
        "║   DeepTrace — Forensic Analysis Report    ║",
        "╚═══════════════════════════════════════════╝",
        "",
        f"  Trust Score  :  {trust:.2%}",
        f"  Manipulation :  {1 - trust:.2%}",
        "",
        "  ── Score Decomposition ────────────────────",
        f"  Video    (×0.40)  score={v:.3f}  →  contrib={breakdown['video_contribution']:.4f}",
        f"  Audio    (×0.30)  score={a:.3f}  →  contrib={breakdown['audio_contribution']:.4f}",
        f"  LipSync  (×0.10)  score={ls:.3f}  →  contrib={breakdown['lipsync_contribution']:.4f}",
        f"  Prov.    (×0.20)  score={p:.3f}  →  contrib={breakdown['provenance_contribution']:.4f}",
        "",
        "  ── Dominant Indicators ─────────────────────",
    ]

    dominant = []
    if v  > 0.60: dominant.append(f"  ⚠  Video artifacts          ({v:.0%} manipulation prob.)")
    if a  > 0.60: dominant.append(f"  ⚠  Audio synthesis patterns  ({a:.0%} manipulation prob.)")
    if ls > 0.60: dominant.append(f"  ⚠  Lip-audio desync          ({ls:.0%} mismatch score)")
    if p  < 0.40: dominant.append(f"  ⚠  Weak provenance chain     ({p:.0%} authenticity)")

    if dominant:
        lines += dominant
    else:
        lines.append("  ✓  No dominant manipulation indicators detected.")

    lines += [
        "",
        "  ── Formula ─────────────────────────────────",
        "  Trust = 1 − [V×0.40 + A×0.30 + L×0.10 + (1−P)×0.20]",
        "",
        "  All scores are independently computed from",
        "  signal-level forensic analysis without ML",
        "  model bias or threshold tuning on this file.",
    ]

    return "\n".join(lines)
