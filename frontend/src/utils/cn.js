// Tiny classname helper (no necesita clsx si no lo tienes instalado)
export function cn(...classes) {
  return classes.filter(Boolean).join(" ");
}