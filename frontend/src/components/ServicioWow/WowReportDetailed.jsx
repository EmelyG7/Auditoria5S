/**
 * WowReportDetailed.jsx — Plantilla "Informe detallado" del Servicio WOW 2026
 * (Claude Design: "Informe Detallado — caso completo / caso mínimo").
 *
 * Hojas: portada · metodología · resultados por pregunta (interno y/o externo)
 * · resultados por sucursal (si hay más de un formulario) · resultados
 * cualitativos · resultado general · comparativo con 2025 (si el departamento
 * se midió en 2025) · colaborador destacado · plan de acción · cierre.
 *
 * Layout dinámico: `buildDetailedSheets` arma la lista de hojas a partir del
 * modelo (wowReportData.js). Las preguntas, formularios externos, sucursales y
 * comentarios se paginan (una hoja = una página del PDF) en vez de asumir un
 * conteo fijo; una sección sin datos no genera hoja.
 */

import {
  Image as ImageIcon, BookOpen, LayoutGrid, MapPin, MessageSquareText,
  PieChart, Award, ListChecks, Flag, Trash2, Plus, ListFilter, TrendingUp,
} from "lucide-react";
import {
  Sheet, PageHead, Body, Editable, QuestionGrid, CommentsTable, AmbassadorSpotlight,
  SatisfactionDonut, useWowReport, addBtn, LOGO_CECOMSA,
} from "./WowReportParts";
import { paginarTarjetas, paginarComentarios, paginarSucursales, selectedCommentsOf } from "./wowReportData";
import { WOW_TOKENS as T, CAP } from "./wowReportTokens";

const SHEET_W = 1000;

/** Hojas del informe, en orden. `nav` = entrada del sidebar (solo la 1ª hoja de cada sección). */
export function buildDetailedSheets(model, draft) {
  const elegidos = new Set(selectedCommentsOf(model, draft));
  const sheets = [
    { id: "portada", kind: "cover", nav: { label: "Portada", icon: ImageIcon } },
    { id: "metodologia", kind: "methodology", nav: { label: "Metodología", icon: BookOpen } },
  ];
  const addCards = (tipo, grupos, label) => {
    paginarTarjetas(grupos).forEach((bloques, i) => sheets.push({
      id: `preguntas-${tipo}-${i}`, kind: "questions", tipo: label, bloques, cont: i > 0,
      nav: i === 0 ? { label: `Preguntas — ${label}`, icon: LayoutGrid } : null,
    }));
  };
  if (model.interno.cards.length) addCards("interno", [{ key: "interno", title: null, cards: model.interno.cards }], "Cliente Interno");
  if (model.externo.groups.length) {
    // Un solo formulario externo: sin subtítulo por formulario
    const grupos = model.externo.groups.length === 1 ? [{ ...model.externo.groups[0], title: null }] : model.externo.groups;
    addCards("externo", grupos, "Cliente Externo");
  }
  paginarSucursales(model.sucursales).forEach((items, i) => sheets.push({
    id: `sucursales-${i}`, kind: "branches", items, cont: i > 0,
    nav: i === 0 ? { label: "Por sucursal", icon: MapPin } : null,
  }));
  [["interno", "Cliente Interno"], ["externo", "Cliente Externo"]].forEach(([tipo, label]) => {
    const visibles = model.allComments[tipo].filter((c) => elegidos.has(c.key));
    const tipos = (model.allComments.interno.length > 0) + (model.allComments.externo.length > 0);
    // Una sección por pregunta abierta (en orden de aparición), con la pregunta bajo el título
    const porPregunta = new Map();
    visibles.forEach((c) => porPregunta.set(c.question, [...(porPregunta.get(c.question) || []), c]));
    let n = 0;
    [...porPregunta].forEach(([pregunta, lista], q) => {
      paginarComentarios(lista).forEach((items, i) => sheets.push({
        id: `cualitativos-${tipo}-${q}-${i}`, kind: "comments", items, cont: i > 0, pregunta,
        tipo: tipos > 1 ? label : null,
        nav: n++ === 0 ? { label: tipos > 1 ? `Comentarios — ${label}` : "Resultados cualitativos", icon: MessageSquareText } : null,
      }));
    });
  });
  sheets.push({ id: "resultado-general", kind: "general", nav: { label: "Resultado general", icon: PieChart } });
  if (model.comparativo) {
    const { anio, anioActual } = model.comparativo;
    sheets.push({ id: "comparativo", kind: "comparison", nav: { label: `Comparativo ${anio} vs ${anioActual}`, icon: TrendingUp } });
  }
  if (model.hasInterno || draft.ambassador?.name) {
    sheets.push({ id: "embajador", kind: "ambassador", nav: { label: "Colaborador destacado", icon: Award } });
  }
  sheets.push({ id: "plan-accion", kind: "action", nav: { label: "Plan de acción", icon: ListChecks } });
  sheets.push({ id: "cierre", kind: "closing", nav: { label: "Cierre", icon: Flag } });
  return sheets;
}

export default function WowReportDetailed({ model, draft, sheets, onChange, onPickComments }) {
  const { editable } = useWowReport();
  const t = draft.texts;
  const setText = (k) => (v) => onChange({ texts: { ...t, [k]: v } });

  const render = (s) => {
    switch (s.kind) {
      case "cover":
        return (
          <Sheet key={s.id} id={s.id} width={SHEET_W} minHeight={680} accent={{ corner: "top-right", variant: "navy", size: 260 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", flex: 1 }}>
              <img src={LOGO_CECOMSA} alt="Cecomsa" style={{ height: 84 }} />
              <Editable value={t.cover_kicker} onChange={setText("cover_kicker")} style={{ ...CAP, marginTop: 40 }} />
              <Editable value={t.cover_title} onChange={setText("cover_title")}
                style={{ fontSize: 44, fontWeight: 700, color: T.navy, lineHeight: 1.15, marginTop: 14 }} />
              <Editable value={t.cover_subtitle} onChange={setText("cover_subtitle")} style={{ fontSize: 19, color: T.slate, marginTop: 10 }} />
              <Editable value={t.period} onChange={setText("period")} placeholder="Período evaluado: …" style={{ fontSize: 14, color: T.slate, marginTop: 4 }} />
              <div style={{ flex: 1 }} />
              <Editable value={t.footer_line1} onChange={setText("footer_line1")} style={{ fontSize: 13, fontWeight: 700, color: T.navy }} />
              <Editable value={t.footer_line2} onChange={setText("footer_line2")} style={{ fontSize: 13, fontWeight: 700, color: T.navy }} />
            </div>
          </Sheet>
        );

      case "methodology":
        return (
          <Sheet key={s.id} id={s.id} width={SHEET_W} minHeight={380} accent={{ corner: "bottom-right", variant: "magenta", size: 140 }}>
            <PageHead title="Metodología" />
            <Body><Editable value={t.methodology} onChange={setText("methodology")} /></Body>
            <div style={{ display: "flex", gap: 16, marginTop: 24 }}>
              <Stat value={model.totals.respuestas}
                label={model.hasExterno && model.hasInterno ? "colaboradores / clientes evaluados" : model.hasExterno ? "clientes evaluados" : "colaboradores evaluados"} />
              <Stat
                value={[model.totals.preguntasInterno || null, model.totals.preguntasExterno || null].filter(Boolean).join(" + ") || "0"}
                label={model.hasInterno && model.hasExterno ? "preguntas cerradas (interno · externo)" : "preguntas cerradas"} />
              {(model.totals.abiertasInterno > 0 || model.totals.abiertasExterno > 0) && (
                <Stat
                  value={[model.totals.abiertasInterno || null, model.totals.abiertasExterno || null].filter(Boolean).join(" + ")}
                  label={model.totals.abiertasInterno && model.totals.abiertasExterno ? "cualitativas (interno · externo)"
                    : (model.totals.abiertasInterno || model.totals.abiertasExterno) === 1 ? "cualitativa" : "cualitativas"} />
              )}
              {model.sucursales.length > 0 && <Stat value={model.sucursales.length} label="formularios / sucursales" />}
            </div>
          </Sheet>
        );

      case "questions":
        return (
          <Sheet key={s.id} id={s.id} width={SHEET_W} minHeight={500}>
            <PageHead title={`Resultados por pregunta${s.cont ? " (cont.)" : ""}`} right={s.tipo} />
            <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
              {s.bloques.map((b) => (
                <div key={b.key + (b.cards[0]?.key || "")}>
                  {b.title && (
                    <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 14 }}>
                      <span style={{ fontSize: 16, fontWeight: 600, color: T.ink }}>{b.title}</span>
                      <span style={{ fontSize: 12, color: T.slate }}>
                        {b.porcentaje != null ? `${Math.round(b.porcentaje)}% · ` : ""}{b.n} respuestas
                      </span>
                    </div>
                  )}
                  <QuestionGrid cards={b.cards} />
                </div>
              ))}
            </div>
          </Sheet>
        );

      case "branches":
        return (
          <Sheet key={s.id} id={s.id} width={SHEET_W} minHeight={500}>
            <PageHead title={`Resultados por sucursal${s.cont ? " (cont.)" : ""}`} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 24 }}>
              {s.items.map((b) => (
                <div key={b.key} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, color: T.ink }}>
                  <SatisfactionDonut percentage={b.porcentaje} size={120} />
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.navy, textAlign: "center" }}>{b.title}</div>
                  <div style={{ fontSize: 11, color: T.slate }}>{b.tipo} · {b.n} resp.</div>
                </div>
              ))}
            </div>
          </Sheet>
        );

      case "comments":
        return (
          <Sheet key={s.id} id={s.id} width={SHEET_W} minHeight={400}>
            <PageHead title={`Resultados cualitativos${s.cont ? " (cont.)" : ""}`} right={s.tipo || "Comentarios abiertos"} />
            {s.pregunta && (
              <div style={{ fontSize: 15, fontWeight: 600, color: T.ink, marginTop: -12, marginBottom: 20, maxWidth: 820 }}>
                {s.pregunta}
              </div>
            )}
            {editable && onPickComments && !s.cont && (
              <button style={{ ...addBtn, marginTop: 0, marginBottom: 16, alignSelf: "flex-start" }} onClick={onPickComments}>
                <ListFilter size={13} /> Elegir comentarios
              </button>
            )}
            <CommentsTable
              items={s.items}
              onHide={(key) => onChange({ selected_comments: selectedCommentsOf(model, draft).filter((k) => k !== key) })}
            />
          </Sheet>
        );

      case "general": {
        const donas = [
          model.hasInterno && ["Cliente Interno", model.interno.porcentaje],
          model.hasExterno && ["Cliente Externo", model.externo.porcentaje],
          model.general != null && ["General", model.general],
        ].filter(Boolean);
        return (
          <Sheet key={s.id} id={s.id} width={SHEET_W} minHeight={520} accent={{ corner: "bottom-left", variant: "navy", size: 170 }}>
            <PageHead title="Resultado general" />
            <Body style={{ marginBottom: 32 }}>
              <Editable value={t.general_text} onChange={setText("general_text")} />
            </Body>
            <div style={{ display: "flex", gap: 56, justifyContent: donas.length === 1 ? "center" : "flex-start" }}>
              {donas.map(([label, p]) => (
                <div key={label} style={{ color: T.ink }}>
                  <SatisfactionDonut percentage={p} size="lg" label={label}
                    labelStyle={{ fontSize: 13, fontWeight: 700, color: T.navy }} />
                </div>
              ))}
            </div>
          </Sheet>
        );
      }

      case "comparison": {
        const c = model.comparativo;
        const filas = [["Cliente Interno", c.interno], ["Cliente Externo", c.externo]].filter(([, f]) => f);
        return (
          <Sheet key={s.id} id={s.id} width={SHEET_W} minHeight={520} accent={{ corner: "bottom-right", variant: "navy", size: 140 }}>
            <PageHead title={`Comparativo Monitoreo de Servicio Wow ${c.anio} vs ${c.anioActual}`} />
            <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
              {filas.map(([label, f]) => (
                <div key={label}>
                  <div style={{ ...CAP, marginBottom: 14 }}>{label}</div>
                  {/* Fila centrada; el recuadro de variación se alinea con el centro de los anillos (no con la etiqueta del año) */}
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "center", gap: 48 }}>
                    <DonaAnio anio={c.anio} pct={f.anterior} color={T.tableHead} />
                    <DonaAnio anio={c.anioActual} pct={f.actual} color={T.green} />
                    <div style={{ height: DONA_PX, display: "flex", alignItems: "center" }}>
                      <Variacion valor={f.variacion} anterior={f.anterior} anio={c.anio} anioActual={c.anioActual} />
                    </div>
                  </div>
                  {f.criterios.length > 0 && <TablaCriterios criterios={f.criterios} anio={c.anio} anioActual={c.anioActual} />}
                </div>
              ))}
            </div>
            <Editable value={t.comparativo_nota} onChange={setText("comparativo_nota")}
              style={{ fontSize: 11, color: T.slate, marginTop: 24, maxWidth: 820 }} />
          </Sheet>
        );
      }

      case "ambassador":
        return (
          <Sheet key={s.id} id={s.id} width={SHEET_W} minHeight={420} accent={{ corner: "bottom-right", variant: "magenta", size: 160 }}>
            <PageHead
              title={<Editable value={t.ambassador_title} onChange={setText("ambassador_title")} as="span" />}
              wow
            />
            <AmbassadorSpotlight
              ambassador={draft.ambassador} department={model.department} nominees={model.nominees}
              onChange={(ambassador) => onChange({ ambassador })}
            />
          </Sheet>
        );

      case "action":
        return (
          <Sheet key={s.id} id={s.id} width={SHEET_W} minHeight={400} accent={{ corner: "bottom-right", variant: "navy", size: 130 }}>
            <PageHead title="Plan de acción y seguimiento" />
            <Body style={{ marginBottom: 20 }}><Editable value={t.action_intro} onChange={setText("action_intro")} /></Body>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {draft.action_items.map((item, i) => (!editable && !item) ? null : (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: T.magenta, flexShrink: 0 }} />
                  <Editable
                    value={item} placeholder="[Acción propuesta — responsable · fecha]" style={{ flex: 1 }}
                    onChange={(v) => onChange({ action_items: draft.action_items.map((x, j) => (j === i ? v : x)) })}
                  />
                  {editable && (
                    <button
                      onClick={() => onChange({ action_items: draft.action_items.filter((_, j) => j !== i) })}
                      title="Quitar acción"
                      style={{ border: "none", background: "transparent", color: T.slate, cursor: "pointer" }}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {editable && (
              <button style={{ ...addBtn, alignSelf: "flex-start" }} onClick={() => onChange({ action_items: [...draft.action_items, ""] })}>
                <Plus size={13} /> Agregar acción
              </button>
            )}
          </Sheet>
        );

      case "closing":
        return (
          <Sheet key={s.id} id={s.id} width={SHEET_W} minHeight={345} padding={56} bar={10} center accent={{ corner: "top-right", variant: "magenta", size: 150 }}>
            <img src={LOGO_CECOMSA} alt="Cecomsa" style={{ height: 68 }} />
            <Editable value={t.closing} onChange={setText("closing")} style={{ fontSize: 24, fontWeight: 700, color: T.navy, marginTop: 8 }} />
            <div style={{ fontSize: 13, color: T.slate, marginTop: 12 }}>{t.footer_line1} · {t.footer_line2}</div>
          </Sheet>
        );

      default:
        return null;
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 48 }}>
      {sheets.map(render)}
    </div>
  );
}

function Stat({ value, label }) {
  return (
    <div style={{ padding: "14px 20px", borderRadius: 12, background: T.surfaceAlt }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: T.navy }}>{value}</div>
      <div style={{ fontSize: 12, color: T.slate }}>{label}</div>
    </div>
  );
}

// ─── Comparativo con el año anterior ─────────────────────────────────────────

const DONA_PX = 130;

function DonaAnio({ anio, pct, color }) {
  return (
    <div style={{ color: T.ink, textAlign: "center" }}>
      <SatisfactionDonut percentage={pct} size={DONA_PX} color={color} label={pct == null ? `${anio} · sin encuesta` : String(anio)}
        labelStyle={{ fontSize: 13, fontWeight: 700, color: T.navy }} />
    </div>
  );
}

const tendencia = (v) => (v == null ? null : v > 0 ? "sube" : v < 0 ? "baja" : "igual");
const TENDENCIA = {
  sube:  { color: T.green, flecha: "▲", texto: "Crecimiento" },
  baja:  { color: T.red, flecha: "▼", texto: "Decrecimiento" },
  igual: { color: T.slate, flecha: "=", texto: "Sin variación" },
};
const fmtVar = (v) => `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;

function Variacion({ valor, anterior, anio, anioActual }) {
  const t = TENDENCIA[tendencia(valor)];
  if (!t) {
    return (
      <div style={{ padding: "18px 24px", borderRadius: 12, background: T.surfaceAlt, color: T.slate, fontSize: 14, maxWidth: 260, textAlign: "center" }}>
        {anterior == null ? `Sin encuesta en ${anio}: no hay base de comparación.` : `Sin resultados en ${anioActual}.`}
      </div>
    );
  }
  return (
    <div style={{ padding: "18px 28px", borderRadius: 12, background: T.surfaceAlt, borderLeft: `6px solid ${t.color}`, minWidth: 220, textAlign: "center" }}>
      <div style={{ fontSize: 34, fontWeight: 700, color: t.color, lineHeight: 1.1 }}>{t.flecha} {fmtVar(valor)}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: T.navy, marginTop: 4 }}>{t.texto}</div>
      <div style={{ fontSize: 12, color: T.slate, marginTop: 2 }}>{anio} → {anioActual}</div>
    </div>
  );
}

function TablaCriterios({ criterios, anio, anioActual }) {
  const celda = { padding: "8px 12px", fontSize: 13, borderBottom: `1px solid ${T.line}` };
  const pct = (v) => (v == null ? "—" : `${Math.round(v)}%`);
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 18 }}>
      <thead>
        <tr style={{ background: T.tableHead, color: "#fff" }}>
          {["Criterio", String(anio), String(anioActual), "Variación"].map((h, i) => (
            <th key={h} style={{ ...celda, fontWeight: 600, textAlign: i ? "center" : "left", borderBottom: "none" }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {criterios.map((c) => {
          const t = TENDENCIA[tendencia(c.variacion)];
          return (
            <tr key={c.code}>
              <td style={{ ...celda, color: T.ink }}>{c.label}</td>
              <td style={{ ...celda, textAlign: "center", color: T.ink }}>{pct(c.anterior)}</td>
              <td style={{ ...celda, textAlign: "center", color: T.ink }}>{pct(c.actual)}</td>
              <td style={{ ...celda, textAlign: "center", fontWeight: 700, color: t ? t.color : T.slate }}>
                {t ? `${t.flecha} ${fmtVar(c.variacion)}` : "—"}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
