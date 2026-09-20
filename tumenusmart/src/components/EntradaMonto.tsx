"use client";

/**
 * Campo de texto para un monto en guaraníes: mientras se escribe va
 * mostrando el separador de miles ("460.000") en vez de un montón de ceros
 * pegados ("460000") — más fácil de detectar un cero de más o de menos de
 * un vistazo, mismo criterio que ya usa formatearGuarani para mostrarlo una
 * vez cargado.
 *
 * Sin clases propias a propósito: cada formulario que lo usa tiene un
 * diseño distinto para este campo (una fila compacta en el cierre de
 * turno, un número grande centrado al abrir turno) — se le pasa el
 * className completo, como a un <input> normal.
 *
 * El valor que entra y sale por `value`/`onChange` es siempre el número
 * limpio, sin puntos — el separador es solo cosmético, no cambia el
 * parseFloat()/la validación que ya tiene cada formulario que lo usa.
 */
export function EntradaMonto({
  value,
  onChange,
  className = "",
  placeholder = "0",
  autoFocus,
}: {
  value: string;
  onChange: (valorLimpio: string) => void;
  className?: string;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const formateado = value
    ? new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 }).format(Number(value))
    : "";

  return (
    <input
      type="text"
      inputMode="numeric"
      autoFocus={autoFocus}
      placeholder={placeholder}
      value={formateado}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
      className={className}
    />
  );
}
