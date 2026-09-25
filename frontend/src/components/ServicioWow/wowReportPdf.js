/**
 * wowReportPdf.js — Exporta a PDF las hojas (`.pdf-page`) de un reporte del
 * Servicio WOW con el mismo patrón jspdf + html2canvas de los dashboards
 * (DashboardAudits / DashboardSurveys / ReportsPage).
 *
 * Diferencia: allí cada página se fuerza a A4 y lo que excede 297 mm se
 * recorta. Las hojas de estos reportes tienen alto variable (depende de cuántas
 * preguntas, comentarios o sucursales tenga el departamento), así que cada
 * página del PDF toma el tamaño de su hoja y no se pierde contenido.
 */

const PX_TO_PT = 0.75;   // 96 dpi → 72 pt

export async function exportSheetsToPDF(root, filename) {
  const { jsPDF } = await import("jspdf");
  const html2canvas = (await import("html2canvas")).default;
  if (document.fonts?.ready) await document.fonts.ready;

  const pages = root?.querySelectorAll(".pdf-page");
  if (!pages?.length) throw new Error("No se encontraron hojas para exportar.");

  let pdf = null;
  for (const page of pages) {
    const w = page.offsetWidth * PX_TO_PT;
    const h = page.offsetHeight * PX_TO_PT;
    const orientation = w > h ? "landscape" : "portrait";
    const canvas = await html2canvas(page, {
      scale: 2, useCORS: true, allowTaint: true, backgroundColor: "#ffffff", logging: false,
    });
    const img = canvas.toDataURL("image/jpeg", 0.93);
    if (!pdf) pdf = new jsPDF({ orientation, unit: "pt", format: [w, h] });
    else pdf.addPage([w, h], orientation);
    pdf.addImage(img, "JPEG", 0, 0, w, h);
  }
  pdf.save(filename);
}
