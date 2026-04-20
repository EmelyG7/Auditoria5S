import { Download, Loader2 } from "lucide-react";
import { useState } from "react";
import api from "../../services/api";

export default function ExportButton({ endpoint, params = {}, filename = "export.xlsx", label = "Exportar Excel" }) {
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    setLoading(true);
    try {
      const res = await api.get(endpoint, { params, responseType: "blob" });
      const url  = URL.createObjectURL(res.data);
      const link = document.createElement("a");
      link.href     = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Export error:", e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button onClick={handleExport} disabled={loading} className="btn-secondary flex items-center gap-2 text-sm">
      {loading ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
      {label}
    </button>
  );
}