"use client";

/**
 * El toggle de 2-3 botones en fila (ticket/factura, delivery/retiro, turno).
 *
 * Estaba copiado a mano en cada formulario con clases levemente distintas
 * entre sí. Con una sola versión, el foco y el contraste se arreglan acá y
 * quedan iguales en todos lados.
 */
export function Segmentado<T extends string>({
  opciones,
  valor,
  onChange,
  className = "",
}: {
  opciones: { value: T; label: string; sublabel?: string }[];
  valor: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={`flex gap-3 ${className}`}>
      {opciones.map((o) => {
        const activo = o.value === valor;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={activo}
            className={`flex-1 rounded-lg border px-3 py-2 text-[0.85rem] font-medium transition-colors duration-150 ${
              activo
                ? "border-brand bg-brand-light text-brand-texto"
                : "border-linea text-tinta-media hover:border-brand/40"
            }`}
          >
            {o.label}
            {o.sublabel && (
              <span
                className={`block text-[0.72rem] font-normal ${
                  activo ? "text-brand-texto/75" : "text-tinta-suave"
                }`}
              >
                {o.sublabel}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
