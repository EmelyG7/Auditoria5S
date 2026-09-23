/**
 * ResponsesImportModal.jsx — Importar el Excel de respuestas de Microsoft Forms.
 *
 * Desde Formularios llega con `form` fijo (botón de la fila). Desde Respuestas
 * llega con `forms` y se elige el formulario en el propio modal.
 * Al importar, quien respondió queda "Completo" en Evaluadores (cruce anónimo).
 */

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import WowImportModal from "./WowImportModal";
import { surveyWowService } from "../../services/surveyWow";
import { SURVEY_TYPE_LABEL } from "./wowUtils";

const formLabel = (f) => `${SURVEY_TYPE_LABEL[f.survey_type]} · ${f.title.split("—").pop().trim()}`;

export default function ResponsesImportModal({ form, forms, initialFormId, onClose }) {
  const qc = useQueryClient();
  const [formId, setFormId] = useState(form?.id ?? initialFormId ?? "");
  const actual = form || forms?.find((f) => f.id === formId);

  const onImport = (file, forzar) => {
    if (!actual) {
      return Promise.reject({ response: { data: { detail: "Elige primero a qué formulario corresponde el Excel." } } });
    }
    return surveyWowService.importResponses(actual.id, file, forzar);
  };

  return (
    <WowImportModal
      title="Importar respuestas"
      subtitle={form ? form.title : "Excel exportado de Microsoft Forms"}
      hint={
        <>
          {!form && (
            <label className="block mb-2">
              <span className="font-semibold text-ink/70">Formulario</span>
              <select
                value={formId}
                onChange={(e) => setFormId(e.target.value ? Number(e.target.value) : "")}
                className="input-glass text-sm py-1.5 px-3 w-full mt-1"
              >
                <option value="">Elige el formulario…</option>
                {forms.map((f) => <option key={f.id} value={f.id}>{formLabel(f)}</option>)}
              </select>
            </label>
          )}
          <p className="font-semibold text-ink/70 mb-0.5">Excel exportado de Microsoft Forms</p>
          <p className="leading-relaxed">
            Nombre y correo del respondiente se descartan al leer el archivo: las respuestas quedan anónimas.
            Quien respondió queda como “Completo” en Evaluadores. Las filas ya importadas (misma columna ID) se omiten.
            {actual?.n_questions === 0 && " Esta es la primera importación: las preguntas del formulario se crearán a partir de este archivo."}
          </p>
        </>
      }
      onImport={onImport}
      stats={(r) => [
        { label: "Importadas",            value: r.importadas,              tone: "success" },
        { label: "Duplicadas",            value: r.duplicadas,              tone: "warning" },
        { label: "Evaluadores completos", value: r.evaluadores_completados, tone: "primary" },
        { label: "Sin match evaluador",   value: r.sin_match_evaluador,     tone: "danger"  },
      ]}
      onClose={onClose}
      onSuccess={() => {
        qc.invalidateQueries({ queryKey: ["wow-forms"] });
        qc.invalidateQueries({ queryKey: ["wow-responses"] });
        qc.invalidateQueries({ queryKey: ["wow-dashboard"] });
        qc.invalidateQueries({ queryKey: ["wow-evaluators"] });
      }}
    />
  );
}
