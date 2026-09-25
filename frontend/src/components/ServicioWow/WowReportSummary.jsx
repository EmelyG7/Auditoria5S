/**
 * WowReportSummary.jsx — Plantilla "Resumen ejecutivo" del Servicio WOW 2026
 * (Claude Design: "Resumen Ejecutivo — caso completo / caso mínimo").
 *
 * Una sola página vertical para publicar: logo, título, párrafo corto, anuncio
 * del embajador, donas grandes, fotos y footer de marca. Mismo modelo y mismo
 * SatisfactionDonut que el informe detallado.
 *
 * Se adapta a los datos: 1 dona (solo interno o solo externo) → 180px centrada;
 * 2-3 donas → 168px. 0, 1 o 2 fotos (al exportar solo se incluyen las cargadas).
 * Sin nominaciones ni nombre, el anuncio del embajador no se muestra.
 */

import { Sheet, Editable, PhotoSlot, BrandFooter, SatisfactionDonut, useWowReport, LOGO_CECOMSA } from "./WowReportParts";
import { WOW_TOKENS as T, CAP } from "./wowReportTokens";

export const SUMMARY_SHEET_ID = "resumen";

export default function WowReportSummary({ model, draft, onChange }) {
  const { editable } = useWowReport();
  const t = draft.texts;
  const setText = (k) => (v) => onChange({ texts: { ...t, [k]: v } });

  const donas = [
    model.hasInterno && ["Cliente Interno", model.interno.porcentaje],
    model.hasExterno && ["Cliente Externo", model.externo.porcentaje],
    model.general != null && ["General", model.general],
  ].filter(Boolean);
  const sola = donas.length === 1;

  const fotos = draft.summary_photos || [null, null];
  const setFoto = (i) => (src) => onChange({ summary_photos: fotos.map((f, j) => (j === i ? src : f)) });
  // Al exportar solo van las fotos cargadas; en edición siempre se ven los 2 espacios
  const slots = editable ? [0, 1] : [0, 1].filter((i) => fotos[i]);
  const embajador = draft.ambassador?.name;

  return (
    <div style={{ display: "flex", justifyContent: "center" }}>
      <Sheet id={SUMMARY_SHEET_ID} width={900} minHeight={(sola ? 1000 : 1120) - (slots.length ? 0 : 240)} padding={0} bar={0}>
        <div style={{ padding: "64px 64px 0", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
          <img src={LOGO_CECOMSA} alt="Cecomsa" style={{ height: 52 }} />

          <Editable value={t.summary_title} onChange={setText("summary_title")}
            style={{ fontSize: 32, fontWeight: 700, color: T.navy, lineHeight: 1.2, marginTop: 36 }} />

          <Editable value={t.summary_paragraph} onChange={setText("summary_paragraph")}
            style={{ fontSize: 14, color: T.slate, lineHeight: 1.5, maxWidth: 600, marginTop: 14 }} />

          {(embajador || editable) && (
            <div style={{ marginTop: 32, padding: "16px 28px", borderRadius: 14, background: T.surfaceAlt }}>
              <div style={CAP}>{draft.ambassador.role}</div>
              <Editable
                value={draft.ambassador.name} placeholder="[Nombre del colaborador]"
                onChange={(name) => onChange({ ambassador: { ...draft.ambassador, name } })}
                style={{ fontSize: 20, fontWeight: 700, color: T.navy, marginTop: 4 }}
              />
            </div>
          )}

          <Editable value={t.summary_slogan} onChange={setText("summary_slogan")}
            style={{ fontSize: 16, fontStyle: "italic", color: T.navy, marginTop: 18 }} />

          <div style={{ display: "flex", justifyContent: "center", gap: 48, marginTop: 36 }}>
            {donas.map(([label, p]) => (
              <div key={label} style={{ color: T.ink }}>
                <SatisfactionDonut percentage={p} size={sola ? 180 : "lg"} label={label} />
              </div>
            ))}
          </div>

          {slots.length > 0 && (
            <div style={{ display: "flex", gap: 16, marginTop: 40, width: "100%" }}>
              {slots.map((i) => (
                <PhotoSlot
                  key={i} src={fotos[i]} onChange={setFoto(i)} width="100%" height={200}
                  placeholder={i === 0 ? "[Foto del equipo]" : "[Foto de la entrega de reconocimiento]"}
                  style={{ flex: 1 }}
                />
              ))}
            </div>
          )}
        </div>

        <div style={{ flex: 1, minHeight: 40 }} />
        <BrandFooter />
      </Sheet>
    </div>
  );
}
