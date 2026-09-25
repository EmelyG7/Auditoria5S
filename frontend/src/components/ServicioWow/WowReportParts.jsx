/**
 * WowReportParts.jsx — Piezas de las plantillas de reporte del Servicio WOW
 * (mapeo 1:1 del artboard "Componentes reutilizables" de Claude Design):
 *   A · QuestionCard (tarjeta pregunta + SatisfactionDonut)
 *   C · CommentsTable (tabla cualitativa, 1 o 2 columnas según volumen)
 *   D · AmbassadorSpotlight (foto + nombre + cita)
 *   E · BrandFooter (degradado navy + logos)
 * más Sheet (una hoja = una página del PDF, clase `pdf-page`), PageHead y Editable.
 *
 * Todo con estilos inline y colores fijos de WOW_TOKENS: lo que se ve es lo que
 * html2canvas captura.
 */

import { createContext, useContext, useEffect, useRef } from "react";
import { ImagePlus, Trash2, Plus, EyeOff } from "lucide-react";
import SatisfactionDonut from "./SatisfactionDonut";
import { WOW_TOKENS as T, CAP, LOGO_CECOMSA, LOGO_CECOMSA_BLANCO, LOGO_SERVICIO_WOW } from "./wowReportTokens";

/** editable = false al exportar: oculta controles de edición y placeholders vacíos. */
export const WowReportContext = createContext({ editable: true });
export const useWowReport = () => useContext(WowReportContext);

// ─── Texto editable (contentEditable seguro: innerText, nunca HTML) ─────────
export function Editable({ value, onChange, style, placeholder, as: Tag = "div" }) {
  const { editable } = useWowReport();
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (el && document.activeElement !== el && el.innerText !== (value ?? "")) el.innerText = value ?? "";
  }, [value]);
  return (
    <Tag
      ref={ref}
      contentEditable={editable}
      suppressContentEditableWarning
      data-placeholder={editable ? placeholder : undefined}
      className={editable ? "wow-editable" : undefined}
      onBlur={(e) => onChange?.(e.currentTarget.innerText.trim())}
      style={{ outline: "none", whiteSpace: "pre-wrap", ...style }}
    />
  );
}

// ─── Hoja ────────────────────────────────────────────────────────────────────
export function Sheet({ id, width = 1000, minHeight, padding = 64, children, bar = 6, center = false }) {
  const { editable } = useWowReport();
  return (
    <section
      id={id}
      className="pdf-page"
      style={{
        position: "relative", width, minHeight, boxSizing: "border-box", background: T.surface,
        borderRadius: editable ? 12 : 0, overflow: "hidden",
        boxShadow: editable ? "0 1px 3px rgba(10,79,121,.08)" : "none",
        fontFamily: T.font, color: T.ink, display: "flex", flexDirection: "column",
      }}
    >
      <div
        style={{
          padding, paddingBottom: padding + bar, boxSizing: "border-box", flex: 1,
          display: "flex", flexDirection: "column",
          ...(center ? { alignItems: "center", justifyContent: "center", textAlign: "center" } : {}),
        }}
      >
        {children}
      </div>
      {bar > 0 && <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: bar, background: T.barGradient }} />}
    </section>
  );
}

export function PageHead({ title, right, logo = true, wow = false }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 24 }}>
      <div style={{ fontSize: 26, fontWeight: 700, color: T.navy, lineHeight: 1.2 }}>{title}</div>
      {right ? <div style={CAP}>{right}</div>
        : wow ? <img src={LOGO_SERVICIO_WOW} alt="Mi Servicio es WOW" style={{ height: 40 }} />
        : logo ? <img src={LOGO_CECOMSA} alt="Cecomsa" style={{ height: 22 }} /> : null}
    </div>
  );
}

export const Body = ({ children, style }) => (
  <div style={{ fontSize: 15, lineHeight: 1.6, color: T.ink, maxWidth: 820, ...style }}>{children}</div>
);

// ─── A · Tarjeta de pregunta con dona ───────────────────────────────────────
export function QuestionCard({ label, text, porcentaje, n }) {
  return (
    <div
      style={{
        boxSizing: "border-box", padding: 24, borderRadius: 16, border: `1px solid ${T.line}`,
        background: T.surface, boxShadow: T.shadow, display: "flex", flexDirection: "column",
        alignItems: "center", textAlign: "center", gap: 12, minWidth: 236, height: "100%",
      }}
    >
      <div style={CAP}>{label}</div>
      <div
        style={{
          fontSize: 14, fontWeight: 600, color: T.ink, lineHeight: 1.4, minHeight: 60, flex: 1,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        {text}
      </div>
      <div style={{ color: T.ink }}><SatisfactionDonut percentage={porcentaje} size="sm" /></div>
      <div style={{ fontSize: 12, color: T.slate }}>
        {porcentaje == null ? "Sin datos" : `${Math.round(porcentaje)}% satisfacción`}
        {n ? ` · ${n} resp.` : ""}
      </div>
    </div>
  );
}

/** Grilla de tarjetas: 1-2 centradas (caso mínimo), 4 en 2×2, el resto en 3 columnas. */
export function QuestionGrid({ cards }) {
  if (cards.length <= 2) {
    return (
      <div style={{ display: "flex", justifyContent: "center", gap: 32, paddingTop: 8 }}>
        {cards.map(({ key, ...c }) => <div key={key} style={{ width: 280 }}><QuestionCard {...c} /></div>)}
      </div>
    );
  }
  const cols = cards.length === 4 ? 2 : 3;
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: 24 }}>
      {cards.map(({ key, ...c }) => <QuestionCard key={key} {...c} />)}
    </div>
  );
}

// ─── C · Tabla cualitativa ──────────────────────────────────────────────────
export function CommentsTable({ items, onHide }) {
  const { editable } = useWowReport();
  const cols = items.length > 4 ? 2 : 1;
  const rows = Math.ceil(items.length / cols);
  return (
    <div
      style={{
        border: `1px solid ${T.line}`, borderRadius: 12, overflow: "hidden",
        maxWidth: cols === 1 ? 640 : undefined,
        display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
      }}
    >
      {items.map((c, i) => {
        const row = Math.floor(i / cols), col = i % cols;
        const alt = cols === 2 ? col === 1 : row % 2 === 1;
        return (
          <div
            key={c.key}
            style={{
              position: "relative", padding: "14px 16px", minHeight: 48, boxSizing: "border-box",
              fontSize: 13, lineHeight: 1.5, background: alt ? T.surfaceAlt : T.surface,
              borderBottom: row < rows - 1 ? `1px solid ${T.line}` : "none",
              borderRight: cols === 2 && col === 0 ? `1px solid ${T.line}` : "none",
            }}
          >
            {c.text}
            {c.branch && <span style={{ color: T.slate, fontSize: 11 }}> — {c.branch}</span>}
            {editable && onHide && (
              <button
                onClick={() => onHide(c.key)} title="Quitar del reporte"
                style={{ position: "absolute", top: 6, right: 6, border: "none", background: "transparent", color: T.slate, cursor: "pointer", padding: 2 }}
              >
                <EyeOff size={13} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Foto (subida local, guardada como dataURL reducido en el borrador) ─────
export function fileToDataURL(file, maxSide = 900) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * k);
      canvas.height = Math.round(img.height * k);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

export function PhotoSlot({ src, onChange, width, height, round = false, placeholder = "Agregar foto", style }) {
  const { editable } = useWowReport();
  const inputRef = useRef(null);
  async function handle(e) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) onChange(await fileToDataURL(f));
  }
  const radius = round ? 999 : 14;
  return (
    <div style={{ position: "relative", width, height, flexShrink: 0, ...style }}>
      {src ? (
        <div
          style={{
            width: "100%", height: "100%", borderRadius: radius, backgroundImage: `url(${src})`,
            backgroundSize: "cover", backgroundPosition: "center",
          }}
        />
      ) : (
        <div
          style={{
            width: "100%", height: "100%", borderRadius: radius, background: T.surfaceAlt,
            border: `1.5px dashed ${T.dashed}`, boxSizing: "border-box",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6,
          }}
        >
          {round ? (
            <svg width={Math.round(width * 0.31)} height={Math.round(width * 0.31)} viewBox="0 0 24 24" fill="none" stroke="#9AA8B2" strokeWidth="1.5">
              <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.5-7 8-7s8 3 8 7" />
            </svg>
          ) : (
            <span style={{ fontSize: 12, color: T.slate }}>{placeholder}</span>
          )}
        </div>
      )}
      {editable && (
        <>
          <input ref={inputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handle} />
          <div style={{ position: "absolute", bottom: 6, right: 6, display: "flex", gap: 4 }}>
            <button onClick={() => inputRef.current?.click()} title="Subir foto" style={iconBtn}><ImagePlus size={14} /></button>
            {src && <button onClick={() => onChange(null)} title="Quitar foto" style={iconBtn}><Trash2 size={14} /></button>}
          </div>
        </>
      )}
    </div>
  );
}

const iconBtn = {
  display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28,
  borderRadius: 999, border: `1px solid ${T.line}`, background: "#fff", color: T.navy, cursor: "pointer",
};

// ─── D · Spotlight del embajador ────────────────────────────────────────────
export function AmbassadorSpotlight({ ambassador, department, onChange, nominees = [] }) {
  const { editable } = useWowReport();
  const set = (patch) => onChange({ ...ambassador, ...patch });
  function pick(name) {
    const nom = nominees.find((n) => n.name === name);
    set({ name, quotes: (nom?.motivos || []).slice(0, 2) });
  }
  return (
    <div style={{ display: "flex", gap: 32, alignItems: "center" }}>
      <PhotoSlot src={ambassador.photo} onChange={(photo) => set({ photo })} width={180} height={180} round />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={CAP}>
          <Editable value={ambassador.role} onChange={(role) => set({ role })} as="span" />
          {department ? ` · ${department}` : ""}
        </div>
        <Editable
          value={ambassador.name} onChange={(name) => set({ name })} placeholder="[Nombre del colaborador]"
          style={{ fontSize: 24, fontWeight: 700, color: T.navy, margin: "6px 0 12px" }}
        />
        {editable && nominees.length > 0 && (
          <select
            value={nominees.some((n) => n.name === ambassador.name) ? ambassador.name : ""}
            onChange={(e) => e.target.value && pick(e.target.value)}
            style={{ fontSize: 12, marginBottom: 10, padding: "4px 8px", borderRadius: 8, border: `1px solid ${T.line}`, color: T.ink }}
          >
            <option value="">Elegir entre los nominados…</option>
            {nominees.map((n) => <option key={n.name} value={n.name}>{n.name} · {n.votos} voto(s)</option>)}
          </select>
        )}
        {ambassador.quotes.map((q, i) => (!editable && !q) ? null : (
          <div key={i} style={{ display: "flex", gap: 6, alignItems: "flex-start", marginTop: i ? 8 : 0 }}>
            <Editable
              value={`"${q.replace(/^"|"$/g, "")}"`}
              onChange={(v) => set({ quotes: ambassador.quotes.map((x, j) => (j === i ? v.replace(/^"|"$/g, "") : x)) })}
              style={{ fontSize: 14, lineHeight: 1.6, color: T.ink, maxWidth: 560, flex: 1 }}
            />
            {editable && (
              <button onClick={() => set({ quotes: ambassador.quotes.filter((_, j) => j !== i) })} title="Quitar cita" style={{ ...iconBtn, width: 24, height: 24 }}>
                <Trash2 size={12} />
              </button>
            )}
          </div>
        ))}
        {editable && (
          <button onClick={() => set({ quotes: [...ambassador.quotes, ""] })} style={addBtn}>
            <Plus size={13} /> Agregar cita
          </button>
        )}
      </div>
    </div>
  );
}

export const addBtn = {
  marginTop: 12, display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px",
  borderRadius: 10, border: `1px dashed ${T.navy}`, background: "transparent", color: T.navy,
  fontSize: 12, fontWeight: 600, cursor: "pointer",
};

// ─── E · Footer de marca ────────────────────────────────────────────────────
export function BrandFooter({ height = 100, padding = 40 }) {
  return (
    <div
      style={{
        height, background: T.gradient, display: "flex", alignItems: "center",
        justifyContent: "space-between", padding: `0 ${padding}px`, boxSizing: "border-box",
      }}
    >
      <img src={LOGO_CECOMSA_BLANCO} alt="Cecomsa" style={{ height: 30, opacity: 0.92 }} />
      <img src={LOGO_SERVICIO_WOW} alt="Mi Servicio es WOW" style={{ height: 60, borderRadius: 6 }} />
    </div>
  );
}

export { SatisfactionDonut, LOGO_CECOMSA };
