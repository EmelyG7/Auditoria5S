"""
backend/app/services/audit_analysis_service.py

Motor de análisis inteligente de auditorías 5S.

Funcionalidades:
  1. Comparativa con auditoría anterior (misma sucursal + tipo)
  2. Detección de S estancadas (sin mejora en N auditorías consecutivas)
  3. Análisis de observaciones/comentarios (patrones, palabras clave, hallazgos recurrentes)
  4. Tendencia por pregunta (¿cuáles preguntas nunca mejoran?)
  5. Resumen ejecutivo en texto (generado por reglas, sin LLM externo)
  6. Preguntas críticas recurrentes
"""

from __future__ import annotations

import re
from collections import Counter, defaultdict
from datetime    import date
from typing      import Optional

from sqlalchemy  import and_, desc
from sqlalchemy.orm import Session

from app.models.audit_models import Audit, AuditQuestion

# ─── Constantes ───────────────────────────────────────────────────────────────

S_NAMES = {
    0: "Seiri (Clasificar)",
    1: "Seiton (Ordenar)",
    2: "Seiso (Limpiar)",
    3: "Seiketsu (Estandarizar)",
    4: "Shitsuke (Disciplina)",
}

S_SHORT = {
    0: "Seiri",
    1: "Seiton",
    2: "Seiso",
    3: "Seiketsu",
    4: "Shitsuke",
}

# Palabras clave que indican problemas en los comentarios
NEGATIVE_KEYWORDS = [
    "falta", "faltan", "no hay", "no existe", "ausencia", "sin", "incompleto",
    "desorganizado", "sucio", "suciedades", "acumulado", "obstáculo", "obstáculos",
    "vencido", "vencidos", "desactualizado", "desactualizados", "deteriorado",
    "mal estado", "roto", "rota", "dañado", "perdido", "extraviado",
    "pendiente", "pendientes", "sin identificar", "sin etiquetar",
    "desordenado", "mezclado", "confuso", "no cumple", "incumple",
    "problema", "problemas", "hallazgo", "deficiencia",
]

POSITIVE_KEYWORDS = [
    "mejoró", "mejoró", "bien", "correcto", "organizado", "limpio",
    "ordenado", "identificado", "etiquetado", "cumple", "conforme",
    "actualizado", "implementado", "sistematizado", "controlado",
]

RECURRENCE_KEYWORDS = [
    "nuevamente", "persiste", "sigue", "continúa", "reincidente",
    "de nuevo", "otra vez", "igual que", "mismo hallazgo",
]


def _safe_float(v) -> float:
    try:
        return float(v) if v is not None else 0.0
    except (TypeError, ValueError):
        return 0.0


def _delta_label(delta: float) -> str:
    """Clasifica el cambio en texto."""
    if delta >= 10:  return "Mejora significativa"
    if delta >= 3:   return "Mejora leve"
    if delta > -3:   return "Sin cambio"
    if delta >= -10: return "Retroceso leve"
    return "Retroceso significativo"


def _delta_icon(delta: float) -> str:
    if delta >= 5:  return "↑↑"
    if delta >= 1:  return "↑"
    if delta > -1:  return "→"
    if delta > -5:  return "↓"
    return "↓↓"


def _semaforo(pct: float) -> str:
    if pct >= 80: return "Cumple"
    if pct >= 60: return "Por mejorar"
    return "Crítico"


# ─── Análisis de comentarios ──────────────────────────────────────────────────

def _analyze_observation(text: str) -> dict:
    """
    Analiza un texto de observación y extrae:
    - Sentimiento: positivo / negativo / neutro
    - Hallazgos clave (sustantivos problemáticos detectados)
    - ¿Es recurrente? (contiene palabras de recurrencia)
    """
    if not text or not text.strip():
        return {"sentiment": "neutro", "keywords": [], "is_recurrent": False, "text": ""}

    text_lower = text.lower()

    neg_hits = [kw for kw in NEGATIVE_KEYWORDS if kw in text_lower]
    pos_hits = [kw for kw in POSITIVE_KEYWORDS if kw in text_lower]
    rec_hits = [kw for kw in RECURRENCE_KEYWORDS if kw in text_lower]

    if len(neg_hits) > len(pos_hits):
        sentiment = "negativo"
    elif len(pos_hits) > 0 and len(neg_hits) == 0:
        sentiment = "positivo"
    else:
        sentiment = "neutro"

    return {
        "sentiment":    sentiment,
        "keywords":     neg_hits[:5],       # primeras 5 palabras problemáticas
        "is_recurrent": len(rec_hits) > 0,
        "text":         text.strip(),
    }


def _extract_topics(observations: list[str]) -> list[dict]:
    """
    Agrupa palabras problemáticas frecuentes en todos los comentarios.
    Retorna top-10 temas con su frecuencia.
    """
    counter = Counter()
    for obs in observations:
        if not obs:
            continue
        obs_lower = obs.lower()
        for kw in NEGATIVE_KEYWORDS:
            if kw in obs_lower:
                counter[kw] += 1
    return [
        {"tema": kw, "frecuencia": freq}
        for kw, freq in counter.most_common(10)
        if freq >= 1
    ]


# ─── Función principal de análisis ───────────────────────────────────────────

def analyze_audit(
    audit_id: int,
    db:       Session,
    history_n: int = 5,     # cuántas auditorías anteriores considerar
) -> dict:
    """
    Genera el análisis completo de una auditoría.

    Retorna:
    {
      "audit_id": int,
      "branch": str,
      "audit_type": str,
      "audit_date": str,
      "percentage": float,
      "status": str,
      "vs_previous": { ... } | None,
      "s_analysis": [ { s_index, name, pct, trend, delta, status, observation_analysis } ],
      "stagnant_s": [ { s_index, name, pct, n_audits, message } ],
      "improving_s": [ ... ],
      "critical_questions": [ { text, s_name, pct, weight, observation } ],
      "recurrent_findings": [ { text, count } ],
      "comment_topics": [ { tema, frecuencia } ],
      "executive_summary": str,
      "recommendations": [ str ],
    }
    """
    # ── Cargar la auditoría objetivo ──────────────────────────────────────────
    audit = db.query(Audit).filter(Audit.id == audit_id).first()
    if not audit:
        return {"error": f"Auditoría id={audit_id} no encontrada."}

    questions: list[AuditQuestion] = (
        db.query(AuditQuestion)
        .filter(AuditQuestion.audit_id == audit_id)
        .order_by(AuditQuestion.s_index, AuditQuestion.question_order)
        .all()
    )

    # ── Cargar historial (misma sucursal + tipo, más recientes primero) ────────
    history: list[Audit] = (
        db.query(Audit)
        .filter(
            Audit.id            != audit_id,
            Audit.branch        == audit.branch,
            Audit.audit_type_id == audit.audit_type_id,
        )
        .order_by(desc(Audit.audit_date))
        .limit(history_n)
        .all()
    )

    # ── Agrupar preguntas por S ───────────────────────────────────────────────
    by_s: dict[int, list[AuditQuestion]] = defaultdict(list)
    for q in questions:
        by_s[q.s_index].append(q)

    # Calcular puntaje por S de la auditoría actual
    def pct_for_s(qs: list[AuditQuestion]) -> float:
        pts = sum(_safe_float(q.points_earned) for q in qs)
        max_pts = sum(_safe_float(q.weight) for q in qs)
        return round((pts / max_pts * 100) if max_pts > 0 else 0, 2)

    s_pcts_current: dict[int, float] = {
        si: pct_for_s(qs) for si, qs in by_s.items()
    }

    # ── Comparativa con auditoría anterior ────────────────────────────────────
    previous = history[0] if history else None
    vs_previous = None

    if previous:
        prev_pct = _safe_float(previous.percentage)
        curr_pct = _safe_float(audit.percentage)
        delta    = round(curr_pct - prev_pct, 2)

        prev_questions = (
            db.query(AuditQuestion)
            .filter(AuditQuestion.audit_id == previous.id)
            .all()
        )
        prev_by_s: dict[int, list] = defaultdict(list)
        for q in prev_questions:
            prev_by_s[q.s_index].append(q)

        s_pcts_prev = {
            si: pct_for_s(qs) for si, qs in prev_by_s.items()
        }

        vs_previous = {
            "audit_id":       previous.id,
            "audit_date":     str(previous.audit_date),
            "percentage":     prev_pct,
            "delta":          delta,
            "delta_label":    _delta_label(delta),
            "delta_icon":     _delta_icon(delta),
            "improved":       delta >= 3,
            "regressed":      delta <= -3,
            "s_deltas":       {
                si: round(s_pcts_current.get(si, 0) - s_pcts_prev.get(si, 0), 2)
                for si in set(s_pcts_current) | set(s_pcts_prev)
            },
        }

    # ── Tendencia por S en el historial ───────────────────────────────────────
    # Para cada S, recopilar los últimos N puntajes (del más antiguo al más reciente)
    s_history_pcts: dict[int, list[float]] = defaultdict(list)

    for hist_audit in reversed(history):  # cronológico
        hqs = (
            db.query(AuditQuestion)
            .filter(AuditQuestion.audit_id == hist_audit.id)
            .all()
        )
        h_by_s: dict[int, list] = defaultdict(list)
        for q in hqs:
            h_by_s[q.s_index].append(q)
        for si in range(5):
            p = pct_for_s(h_by_s.get(si, []))
            s_history_pcts[si].append(p)

    # Agregar el actual al final
    for si, pct in s_pcts_current.items():
        s_history_pcts[si].append(pct)

    # ── Clasificar cada S ─────────────────────────────────────────────────────
    s_analysis   = []
    stagnant_s   = []
    improving_s  = []

    for si in sorted(by_s.keys()):
        pct  = s_pcts_current[si]
        name = S_NAMES.get(si, f"S{si+1}")
        hist = s_history_pcts[si]

        # Tendencia: calcular delta entre primer y último de la historia
        if len(hist) >= 2:
            trend_delta = hist[-1] - hist[0]
            if trend_delta >= 5:
                trend = "mejorando"
            elif trend_delta <= -5:
                trend = "empeorando"
            else:
                trend = "estancado"
        else:
            trend       = "sin_historia"
            trend_delta = 0

        # ¿Estancado? Si en los últimos 3 puntos la variación es < 3 pp
        is_stagnant = False
        if len(hist) >= 3:
            window = hist[-3:]
            variation = max(window) - min(window)
            if variation < 3 and pct < 80:
                is_stagnant = True

        # ¿Mejorando significativamente?
        is_improving = len(hist) >= 2 and (hist[-1] - hist[-2]) >= 5

        # Análisis de observación de esta S
        obs_texts = [
            q.observation for q in by_s[si]
            if q.observation and q.observation.strip()
        ]
        obs_analysis = _analyze_observation(" ".join(obs_texts)) if obs_texts else None

        delta_vs_prev = (
            vs_previous["s_deltas"].get(si, 0) if vs_previous else 0
        )

        entry = {
            "s_index":        si,
            "name":           name,
            "short":          S_SHORT.get(si, f"S{si+1}"),
            "percentage":     pct,
            "status":         _semaforo(pct),
            "trend":          trend,
            "trend_delta":    round(trend_delta, 2),
            "delta_vs_prev":  delta_vs_prev,
            "delta_icon":     _delta_icon(delta_vs_prev),
            "history":        [round(h, 1) for h in hist],
            "observation":    obs_analysis,
            "is_stagnant":    is_stagnant,
            "is_improving":   is_improving,
        }
        s_analysis.append(entry)

        if is_stagnant:
            stagnant_s.append({
                "s_index": si,
                "name":    name,
                "short":   S_SHORT.get(si, f"S{si+1}"),
                "percentage": pct,
                "n_audits":   len(hist),
                "variation":  round(max(hist[-3:]) - min(hist[-3:]), 2) if len(hist) >= 3 else 0,
                "message":    (
                    f"{S_SHORT.get(si)} lleva {len(hist)} auditorías sin mejora significativa "
                    f"(variación < 3 pp). Puntaje actual: {pct:.1f}%."
                ),
            })

        if is_improving:
            improving_s.append({
                "s_index":    si,
                "name":       name,
                "short":      S_SHORT.get(si, f"S{si+1}"),
                "percentage": pct,
                "delta":      round(hist[-1] - hist[-2], 2),
            })

    # ── Preguntas críticas (respuesta 0%, con mayor peso) ─────────────────────
    critical_questions = []
    for q in questions:
        resp = _safe_float(q.response_percent)
        if resp == 0 and _safe_float(q.weight) > 0:
            obs = _analyze_observation(q.observation or "")
            critical_questions.append({
                "question_text": q.question_text,
                "s_name":        q.s_name or S_NAMES.get(q.s_index, ""),
                "s_index":       q.s_index,
                "weight":        _safe_float(q.weight),
                "response_pct":  0,
                "observation":   obs if obs["text"] else None,
            })
    # Ordenar por peso (las que más impactan primero)
    critical_questions.sort(key=lambda x: x["weight"], reverse=True)
    critical_questions = critical_questions[:10]

    # ── Hallazgos recurrentes (entre todas las auditorías del historial) ───────
    all_obs_texts: list[str] = []

    # Observaciones de la auditoría actual
    for q in questions:
        if q.observation and q.observation.strip():
            all_obs_texts.append(q.observation)
    if audit.general_observations:
        all_obs_texts.append(audit.general_observations)

    # Observaciones del historial (últimas 3)
    for hist_audit in history[:3]:
        hqs = db.query(AuditQuestion).filter(AuditQuestion.audit_id == hist_audit.id).all()
        for q in hqs:
            if q.observation and q.observation.strip():
                all_obs_texts.append(q.observation)

    comment_topics = _extract_topics(all_obs_texts)

    # Detectar frases recurrentes entre auditorías del historial
    recurrent_findings = []
    if history:
        # Extraer fragmentos cortos de observaciones actuales
        current_obs_short = set()
        for q in questions:
            if q.observation:
                # Tomar los primeros 40 caracteres como huella
                snippet = q.observation.strip()[:50].lower()
                if len(snippet) > 10:
                    current_obs_short.add(snippet)

        # Buscar en historial
        finding_counter: Counter = Counter()
        for hist_audit in history[:3]:
            hqs = db.query(AuditQuestion).filter(AuditQuestion.audit_id == hist_audit.id).all()
            for q in hqs:
                if q.observation:
                    snippet = q.observation.strip()[:50].lower()
                    if snippet in current_obs_short:
                        finding_counter[q.observation.strip()[:80]] += 1

        recurrent_findings = [
            {"text": text, "count": count + 1}   # +1 por la auditoría actual
            for text, count in finding_counter.most_common(5)
            if count >= 1
        ]

    # ── Resumen ejecutivo (generado por reglas) ───────────────────────────────
    curr_pct   = _safe_float(audit.percentage)
    audit_type = audit.audit_type.name if audit.audit_type else "Auditoría"
    summary_parts = []

    # Frase de apertura
    if curr_pct >= 80:
        summary_parts.append(
            f"La {audit_type} de {audit.branch} obtuvo un puntaje de {curr_pct:.1f}%, "
            f"ubicándose en nivel **Cumple**."
        )
    elif curr_pct >= 60:
        summary_parts.append(
            f"La {audit_type} de {audit.branch} obtuvo {curr_pct:.1f}%, "
            f"en nivel **Por Mejorar**."
        )
    else:
        summary_parts.append(
            f"La {audit_type} de {audit.branch} obtuvo {curr_pct:.1f}%, "
            f"en nivel **Crítico**. Se requieren acciones inmediatas."
        )

    # Comparativa con anterior
    if vs_previous:
        d = vs_previous["delta"]
        if d >= 3:
            summary_parts.append(
                f"Representa una **mejora de {d:.1f} pp** respecto a la auditoría anterior "
                f"({vs_previous['percentage']:.1f}% → {curr_pct:.1f}%)."
            )
        elif d <= -3:
            summary_parts.append(
                f"Representa un **retroceso de {abs(d):.1f} pp** respecto a la auditoría anterior "
                f"({vs_previous['percentage']:.1f}% → {curr_pct:.1f}%). Requiere atención."
            )
        else:
            summary_parts.append(
                f"El puntaje se mantiene similar a la auditoría anterior "
                f"(delta: {d:+.1f} pp)."
            )

    # Mejor y peor S
    if s_analysis:
        best_s  = max(s_analysis, key=lambda x: x["percentage"])
        worst_s = min(s_analysis, key=lambda x: x["percentage"])
        summary_parts.append(
            f"La mejor dimensión es **{best_s['short']}** ({best_s['percentage']:.1f}%) "
            f"y la que requiere mayor atención es **{worst_s['short']}** "
            f"({worst_s['percentage']:.1f}%)."
        )

    # Estancamiento
    if stagnant_s:
        names = ", ".join(s["short"] for s in stagnant_s)
        summary_parts.append(
            f"Se detecta **estancamiento** en: {names}. "
            f"Estas dimensiones no han mostrado mejora significativa en las últimas auditorías."
        )

    # Hallazgos recurrentes
    if recurrent_findings:
        summary_parts.append(
            f"Se identificaron **{len(recurrent_findings)} hallazgo(s) recurrente(s)** "
            f"que persisten desde auditorías anteriores."
        )

    # Preguntas críticas
    if critical_questions:
        summary_parts.append(
            f"Hay **{len(critical_questions)} pregunta(s) con 0%** de cumplimiento "
            f"que representan los mayores puntos perdidos."
        )

    executive_summary = " ".join(summary_parts)

    # ── Recomendaciones automáticas ───────────────────────────────────────────
    recommendations = []

    if stagnant_s:
        for s in stagnant_s[:2]:
            recommendations.append(
                f"Realizar un taller de mejora enfocado en **{s['name']}**: "
                f"llevar {s['n_audits']} auditorías sin avance significativo."
            )

    if critical_questions:
        top_crit = critical_questions[0]
        recommendations.append(
            f"Priorizar corrección de: «{top_crit['question_text'][:80]}» "
            f"(peso: {top_crit['weight']:.1f}%, actualmente 0%)."
        )

    if recurrent_findings:
        recommendations.append(
            "Implementar un plan de acción correctivo para los hallazgos recurrentes. "
            "Se recomienda asignar responsable y fecha de cierre en la próxima auditoría."
        )

    if vs_previous and vs_previous["regressed"]:
        worst_delta_s = min(s_analysis, key=lambda x: x["delta_vs_prev"])
        recommendations.append(
            f"Investigar las causas del retroceso en **{worst_delta_s['name']}** "
            f"(cayó {abs(worst_delta_s['delta_vs_prev']):.1f} pp vs auditoría anterior)."
        )

    if not recommendations:
        if curr_pct >= 80:
            recommendations.append(
                "Mantener las buenas prácticas actuales y documentar los procesos exitosos "
                "para replicarlos en otras sucursales."
            )
        else:
            recommendations.append(
                "Elaborar un plan de acción 5S con responsables y fechas para "
                "cada dimensión por debajo de 80%."
            )

    # ── Respuesta final ───────────────────────────────────────────────────────
    return {
        "audit_id":          audit_id,
        "branch":            audit.branch,
        "audit_type":        audit.audit_type.name if audit.audit_type else "",
        "audit_date":        str(audit.audit_date),
        "percentage":        curr_pct,
        "status":            _semaforo(curr_pct),
        "history_count":     len(history),

        "vs_previous":       vs_previous,
        "s_analysis":        s_analysis,
        "stagnant_s":        stagnant_s,
        "improving_s":       improving_s,

        "critical_questions":  critical_questions,
        "recurrent_findings":  recurrent_findings,
        "comment_topics":      comment_topics,

        "executive_summary": executive_summary,
        "recommendations":   recommendations,
    }


# ─── Análisis comparativo multi-auditoría (para una sucursal) ─────────────────

def analyze_branch_trend(
    branch:        str,
    audit_type_id: int,
    db:            Session,
    limit:         int = 10,
) -> dict:
    """
    Análisis de tendencia histórica para una sucursal + tipo de auditoría.
    Retorna la evolución de puntajes por S a lo largo del tiempo.
    """
    audits: list[Audit] = (
        db.query(Audit)
        .filter(
            Audit.branch        == branch,
            Audit.audit_type_id == audit_type_id,
        )
        .order_by(Audit.audit_date.asc())
        .limit(limit)
        .all()
    )

    if not audits:
        return {"branch": branch, "audits": [], "trend": "sin_datos"}

    series = []
    for a in audits:
        qs = db.query(AuditQuestion).filter(AuditQuestion.audit_id == a.id).all()
        by_s: dict[int, list] = defaultdict(list)
        for q in qs:
            by_s[q.s_index].append(q)

        def ps(si):
            qlist = by_s.get(si, [])
            pts   = sum(_safe_float(q.points_earned) for q in qlist)
            maxp  = sum(_safe_float(q.weight) for q in qlist)
            return round(pts / maxp * 100, 1) if maxp > 0 else None

        series.append({
            "audit_id":  a.id,
            "audit_date": str(a.audit_date),
            "percentage": _safe_float(a.percentage),
            "seiri":     ps(0),
            "seiton":    ps(1),
            "seiso":     ps(2),
            "seiketsu":  ps(3),
            "shitsuke":  ps(4),
        })

    # Tendencia global: ¿mejora, empeora o estancada?
    if len(series) >= 2:
        first_pct = series[0]["percentage"]
        last_pct  = series[-1]["percentage"]
        overall_delta = last_pct - first_pct
        if overall_delta >= 5:
            trend = "mejorando"
        elif overall_delta <= -5:
            trend = "empeorando"
        else:
            trend = "estancado"
    else:
        overall_delta = 0
        trend         = "insuficiente"

    return {
        "branch":         branch,
        "audit_type_id":  audit_type_id,
        "total_audits":   len(audits),
        "overall_delta":  round(overall_delta, 2),
        "trend":          trend,
        "series":         series,
    }