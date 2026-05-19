import { memo } from "react";

/**
 * Input de fecha completamente aislado de re-renders del padre.
 * () => true le dice a React que las props nunca cambian → el componente
 * nunca se re-renderiza después del montaje inicial.
 * Esto evita que el popup del calendario nativo se cierre cuando el
 * componente padre recibe nuevas props o actualiza su estado.
 * Para resetear el valor se debe cambiar la `key` desde el padre.
 */
const StableDateInput = memo(
  ({ defaultValue, onChange, className }) => (
    <input
      type="date"
      defaultValue={defaultValue}
      onChange={onChange}
      className={className}
    />
  ),
  () => true,
);

export default StableDateInput;
