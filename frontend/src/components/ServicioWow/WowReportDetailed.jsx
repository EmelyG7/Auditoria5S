/**
 * WowReportDetailed.jsx — Plantilla "Informe detallado" del Servicio WOW 2026
 * (Claude Design: "Informe Detallado — caso completo / caso mínimo").
 *
 * Hojas: portada · metodología · resultados por pregunta (interno y/o externo)
 * · resultados por sucursal (si hay más de un formulario) · resultados
 * cualitativos · resultado general · colaborador destacado · plan de acción · cierre.
 *
 * Layout dinámico: `buildDetailedSheets` arma la lista de hojas a partir del
 * modelo (wowReportData.js). Las preguntas, formularios externos, sucursales y
 * comentarios se paginan (una hoja = una página del PDF) en vez de asumir un
 * conteo fijo; una sección sin datos no genera hoja.
 */

import {
  Image as ImageIcon, BookOpen, LayoutGrid, MapPin, MessageSquareText,
  PieChart, Award, ListChecks, Flag, Trash2, Plus,
} from "lucide-react";
import {
  Sheet, PageHead, Body, Editable, QuestionGrid, CommentsTable, AmbassadorSpotlight,
  SatisfactionDonut, useWowReport, addBtn, LOGO_CECOMSA,
} from "./WowReportParts";
import { paginarTarjetas, paginarComentarios, paginarSucursales } from "./wowReportData";
import { WOW_TOKENS as T, CAP } from "./wowReportTokens";

const SHEET_W = 1000;

/** Hojas del informe, en orden. `nav` = entrada del sidebar (solo la 1ª hoja de cada sección). */
export function buildDetailedSheets(model, draft) {
  const hidden = new Set(draft.hidden_comments || []);
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
    const visibles = model.comments[tipo].filter((c) => !hidden.has(c.key));
    const tipos = (model.comments.interno.length > 0) + (model.comments.externo.length > 0);
    paginarComentarios(visibles).forEach((items, i) => sheets.push({
      id: `cualitativos-${tipo}-${i}`, kind: "comments", items, cont: i > 0,
      tipo: tipos > 1 ? label : null,
      nav: i === 0 ? { label: tipos > 1 ? `Comentarios — ${label}` : "Resultados cualitativos", icon: MessageSquareText } : null,
    }));
  });
  sheets.push({ id: "resultado-general", kind: "general", nav: { label: "Resultado general", icon: PieChart } });
  if (model.hasInterno || draft.ambassador?.name) {
    sheets.push({ id: "embajador", kind: "ambassador", nav: { label: "Colaborador destacado", icon: Award } });
  }
  sheets.push({ id: "plan-accion", kind: "action", nav: { label: "Plan de acción", icon: ListChecks } });
  sheets.push({ id: "cierre", kind: "closing", nav: { label: "Cierre", icon: Flag } });
  return sheets;
}

export default function WowReportDetailed({ model, draft, sheets, onChange }) {
  const { editable } = useWowReport();
  const t = draft.texts;
  const setText = (k) => (v) => onChange({ texts: { ...t, [k]: v } });

  const render = (s) => {
    switch (s.kind) {
      case "cover":
        return (
          <Sheet key={s.id} id={s.id} width={SHEET_W} minHeight={640}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", flex: 1 }}>
              <img src={LOGO_CECOMSA} alt="Cecomsa" style={{ height: 52 }} />
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
          <Sheet key={s.id} id={s.id} width={SHEET_W} minHeight={380}>
            <PageHead title="Metodología" />
            <Body><Editable value={t.methodology} onChange={setText("methodology")} /></Body>
            <div style={{ display: "flex", gap: 16, marginTop: 24 }}>
              <Stat value={model.totals.respuestas}
                label={model.hasExterno && model.hasInterno ? "colaboradores / clientes evaluados" : model.hasExterno ? "clientes evaluados" : "colaboradores evaluados"} />
              <Stat
                value={[model.totals.preguntasInterno || null, model.totals.preguntasExterno || null].filter(Boolean).join(" + ") || "0"}
                label={model.hasInterno && model.hasExterno ? "preguntas cerradas (interno · externo)" : "preguntas cerradas"} />
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
            <CommentsTable
              items={s.items}
              onHide={(key) => onChange({ hidden_comments: [...(draft.hidden_comments || []), key] })}
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
          <Sheet key={s.id} id={s.id} width={SHEET_W} minHeight={500}>
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

      case "ambassador":
        return (
          <Sheet key={s.id} id={s.id} width={SHEET_W} minHeight={420}>
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
          <Sheet key={s.id} id={s.id} width={SHEET_W} minHeight={400}>
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
          <Sheet key={s.id} id={s.id} width={SHEET_W} minHeight={320} padding={56} bar={10} center>
            <img src={LOGO_CECOMSA} alt="Cecomsa" style={{ height: 44 }} />
            <Editable value={t.closing} onChange={setText("closing")} style={{ fontSize: 24, fontWeight: 700, color: T.navy, marginTop: 20 }} />
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
