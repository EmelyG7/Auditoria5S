import { useState, useCallback } from "react";

export function useFilters(defaults = {}) {
  const [filters, setFilters] = useState(defaults);

  const setFilter = useCallback((key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value || undefined }));
  }, []);

  const resetFilters = useCallback(() => setFilters(defaults), [defaults]);

  // Eliminar keys con valor undefined para no contaminar la query
  const activeFilters = Object.fromEntries(
    Object.entries(filters).filter(([, v]) => v !== undefined && v !== "" && v !== null)
  );

  return { filters, activeFilters, setFilter, resetFilters };
}