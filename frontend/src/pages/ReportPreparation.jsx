/**
 * ReportPreparation.jsx — Pantalla intermedia de preparación antes de
 * generar el Reporte de Presentación departamental.
 *
 * Flujo:
 *   1. Elegir departamento + período → "Cargar datos"
 *   2. Por cada sucursal encontrada: seleccionar imágenes (de las ya
 *      adjuntas a la auditoría) y, opcionalmente, subir imágenes
 *      adicionales (solo en memoria, no se suben al servidor) + datos
 *      de Odoo (solo Almacenes).
 *   3. "Continuar → Generar Reporte" navega a /reports/presentation/editor
 *      pasando todo lo preparado vía React Router state.
 */
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { MapPin, ImagePlus, Loader2, X, ZoomIn, ArrowRight, AlertCircle, ExternalLink } from "lucide-react";
import { auditsService } from "../services/audits";
import { reportsPresentationService } from "../services/reportsPresentation";
import Header from "../components/Layout/Header";
import GlassCard from "../components/Layout/GlassCard";

const API_BASE = import.meta.env.VITE_API_URL?.replace("/api/v1", "") || "http://localhost:8000";
const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
const YEARS = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() + 1 - i);

function imgUrl(url) {
  if (!url) return null;
  return url.startsWith("http") ? url : `${API_BASE}${url}`;
}

export default function ReportPreparation() {
  const navigate = useNavigate();

  const [auditTypeId, setAuditTypeId] = useState("");
  const [periodMonth, setPeriodMonth] = useState("");
  const [periodYear, setPeriodYear]   = useState(String(new Date().getFullYear()));

  const [reportData, setReportData]   = useState(null);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState(null);

  const [imagesBySucursal, setImagesBySucursal] = useState({});
  const [odooBySucursal, setOdooBySucursal]     = useState({});
  const [lightbox, setLightbox]                 = useState(null);

  const { data: types = [] } = useQuery({
    queryKey: ["audit-types"],
    queryFn:  auditsService.getTypes,
  });

  async function handleLoadData() {
    if (!auditTypeId || !periodMonth || !periodYear) return;
    setLoading(true);
    setError(null);
    try {
      const data = await reportsPresentationService.getData({
        audit_type_id: Number(auditTypeId),
        period_month:  Number(periodMonth),
        period_year:   Number(periodYear),
      });
      setReportData(data);

      const initialImages = {};
      const initialOdoo   = {};
      data.audits.forEach((a) => {
        initialImages[a.sucursal] = (a.attachments || []).map((att) => ({
          id: att.id,
          filename: att.filename,
          url: imgUrl(att.url),
          isExternal: att.is_external,
          // Las imágenes externas (links de SharePoint/OneDrive) no siempre se
          // pueden incrustar como <img>; se dejan sin seleccionar por defecto.
          selected: !att.is_external,
        }));
        initialOdoo[a.sucursal] = { transferencias: 0, conduces: 0 };
      });
      setImagesBySucursal(initialImages);
      setOdooBySucursal(initialOdoo);
    } catch (e) {
      setError(e.response?.data?.detail || "No se pudieron cargar los datos del período seleccionado.");
      setReportData(null);
    } finally {
      setLoading(false);
    }
  }

  function toggleImage(sucursal, imageId) {
    setImagesBySucursal((prev) => ({
      ...prev,
      [sucursal]: prev[sucursal].map((img) =>
        img.id === imageId ? { ...img, selected: !img.selected } : img
      ),
    }));
  }

  function handleAddLocalImage(sucursal, file) {
    const url = URL.createObjectURL(file);
    setImagesBySucursal((prev) => ({
      ...prev,
      [sucursal]: [
        ...(prev[sucursal] || []),
        { id: `local-${Date.now()}-${Math.random().toString(36).slice(2)}`, filename: file.name, url, selected: true, isLocal: true },
      ],
    }));
  }

  function updateOdoo(sucursal, field, value) {
    setOdooBySucursal((prev) => ({
      ...prev,
      [sucursal]: { ...prev[sucursal], [field]: Number(value) || 0 },
    }));
  }

  function handleContinue() {
    if (!reportData) return;
    const selectedImagesBySucursal = Object.fromEntries(
      Object.entries(imagesBySucursal).map(([suc, imgs]) => [suc, imgs.filter((i) => i.selected)])
    );
    navigate("/reports/presentation/editor", {
      state: {
        reportData,
        auditTypeId: Number(auditTypeId),
        selectedImagesBySucursal,
        odooDataBySucursal: odooBySucursal,
      },
    });
  }

  const department = reportData?.department;
  const sucursales  = reportData ? [...new Set(reportData.audits.map((a) => a.sucursal))] : [];

  return (
    <div className="min-h-screen relative z-10">
      <Header title="Preparar Reporte de Presentación" subtitle="Selecciona el departamento y período a reportar" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        <GlassCard>
          <h3 className="text-sm font-semibold text-ink/70 uppercase tracking-wide mb-4">Configuración</h3>

          <label className="field-label">Departamento</label>
          <select
            value={auditTypeId}
            onChange={(e) => setAuditTypeId(e.target.value)}
            className="input-glass text-sm mb-4"
          >
            <option value="">Selecciona un departamento…</option>
            {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>

          <label className="field-label">Período</label>
          <div className="flex gap-2 mb-5">
            <select value={periodMonth} onChange={(e) => setPeriodMonth(e.target.value)} className="input-glass text-sm">
              <option value="">Mes</option>
              {MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
            </select>
            <select value={periodYear} onChange={(e) => setPeriodYear(e.target.value)} className="input-glass text-sm">
              {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          <button
            onClick={handleLoadData}
            disabled={!auditTypeId || !periodMonth || !periodYear || loading}
            className="btn-primary text-sm flex items-center gap-2 disabled:opacity-50"
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : null}
            Cargar datos
          </button>

          {error && (
            <p className="text-xs text-danger mt-3 flex items-center gap-1.5">
              <AlertCircle size={13} /> {error}
            </p>
          )}
        </GlassCard>

        <GlassCard>
          <h3 className="text-sm font-semibold text-ink/70 uppercase tracking-wide mb-4">Previsualización de Selección</h3>
          {!reportData ? (
            <p className="text-xs text-ink/40 italic">Carga datos para ver la previsualización.</p>
          ) : (
            <div className="space-y-2 text-sm">
              <p><span className="text-ink/40">Departamento:</span> <strong>{department}</strong></p>
              <p><span className="text-ink/40">Auditorías encontradas:</span> <strong>{reportData.audits.length}</strong></p>
              <p><span className="text-ink/40">Sucursales:</span> <strong>{sucursales.join(", ") || "—"}</strong></p>
              <p><span className="text-ink/40">Rango de fechas:</span> <strong>{reportData.date_range || "—"}</strong></p>
              <p><span className="text-ink/40">Trimestre:</span> <strong>{reportData.quarter_label}</strong></p>
            </div>
          )}
        </GlassCard>
      </div>

      {reportData && reportData.audits.length === 0 && (
        <GlassCard className="mb-5">
          <p className="text-sm text-ink/50 italic">No se encontraron auditorías para ese departamento y período.</p>
        </GlassCard>
      )}

      {reportData?.audits.map((audit) => (
        <SucursalPrepCard
          key={audit.sucursal + (audit.is_mobiliario ? "-mob" : "")}
          audit={audit}
          department={department}
          images={imagesBySucursal[audit.sucursal] || []}
          odoo={odooBySucursal[audit.sucursal] || { transferencias: 0, conduces: 0 }}
          onToggleImage={(id) => toggleImage(audit.sucursal, id)}
          onAddLocalImage={(file) => handleAddLocalImage(audit.sucursal, file)}
          onUpdateOdoo={(field, value) => updateOdoo(audit.sucursal, field, value)}
          onZoom={(img) => setLightbox(img)}
        />
      ))}

      {reportData?.audits.length > 0 && (
        <div className="flex justify-end mt-2">
          <button onClick={handleContinue} className="btn-primary flex items-center gap-2 text-sm">
            Continuar → Generar Reporte <ArrowRight size={15} />
          </button>
        </div>
      )}

      {lightbox && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ background: "rgba(10,10,20,0.85)", backdropFilter: "blur(6px)" }}
          onClick={() => setLightbox(null)}
        >
          <button className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20" onClick={() => setLightbox(null)}>
            <X size={20} />
          </button>
          <img src={lightbox.url} alt={lightbox.filename} className="max-w-full max-h-[90vh] rounded-2xl shadow-2xl object-contain" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}

function SucursalPrepCard({ audit, department, images, odoo, onToggleImage, onAddLocalImage, onUpdateOdoo, onZoom }) {
  const inputRef = useRef(null);

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (file) onAddLocalImage(file);
    e.target.value = "";
  }

  return (
    <GlassCard className="mb-5">
      <div className="flex items-center gap-2 mb-1">
        <MapPin size={15} className="text-primary" />
        <span className="font-semibold text-ink">{audit.sucursal}</span>
        <span className="text-ink/40 text-sm">— {audit.audit_date}</span>
        <span className={`ml-auto text-sm font-bold ${audit.total_pct >= 80 ? "text-success" : audit.total_pct >= 60 ? "text-warning" : "text-danger"}`}>
          {audit.total_pct.toFixed(1)}%
        </span>
      </div>
      {audit.is_mobiliario && (
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">Mobiliario</span>
      )}

      <p className="text-xs font-semibold text-ink/50 uppercase tracking-wide mt-4 mb-2">
        Imágenes disponibles en el sistema
      </p>
      {images.length === 0 ? (
        <p className="text-xs text-ink/30 italic mb-2">Sin imágenes adjuntas en esta auditoría.</p>
      ) : (
        <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 mb-3">
          {images.map((img) => (
            <div key={img.id} className="relative group aspect-square rounded-xl overflow-hidden bg-ink/5">
              {img.isExternal ? (
                <div className="w-full h-full flex flex-col items-center justify-center gap-1 p-1 bg-primary/5 border border-primary/15">
                  <ExternalLink size={16} className="text-primary/50" />
                  <a
                    href={img.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[9px] text-primary font-semibold hover:underline text-center line-clamp-2 px-1"
                  >
                    Abrir en SharePoint
                  </a>
                </div>
              ) : (
                <>
                  <img src={img.url} alt={img.filename} className="w-full h-full object-cover" loading="lazy" />
                  <button
                    onClick={() => onZoom(img)}
                    className="absolute top-1 left-1 p-1 rounded-md bg-black/40 text-white opacity-0 group-hover:opacity-100 transition"
                    title="Ver imagen completa"
                  >
                    <ZoomIn size={11} />
                  </button>
                </>
              )}
              <label className="absolute bottom-1 right-1 flex items-center justify-center w-5 h-5 rounded-md bg-white/90 cursor-pointer">
                <input type="checkbox" checked={img.selected} onChange={() => onToggleImage(img.id)} className="w-3.5 h-3.5" />
              </label>
            </div>
          ))}
        </div>
      )}

      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      <button
        onClick={() => inputRef.current?.click()}
        className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl bg-primary/10 text-primary font-medium hover:bg-primary/20 transition-colors"
      >
        <ImagePlus size={13} /> Subir imagen adicional
      </button>

      {department === "Almacenes" && (
        <div className="mt-4 pt-4 border-t border-ink/10">
          <p className="text-xs font-semibold text-ink/50 uppercase tracking-wide mb-2">Datos Odoo</p>
          <div className="flex items-center gap-4 text-sm">
            <label className="flex items-center gap-2">
              Transferencias:
              <input
                type="number" min="0" value={odoo.transferencias}
                onChange={(e) => onUpdateOdoo("transferencias", e.target.value)}
                className="input-glass w-20 text-sm py-1"
              />
              abiertas
            </label>
            <label className="flex items-center gap-2">
              Conduces:
              <input
                type="number" min="0" value={odoo.conduces}
                onChange={(e) => onUpdateOdoo("conduces", e.target.value)}
                className="input-glass w-20 text-sm py-1"
              />
              abiertos
            </label>
          </div>
        </div>
      )}
    </GlassCard>
  );
}
