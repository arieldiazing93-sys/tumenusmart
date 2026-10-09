"use client";

/**
 * El toggle de 2-3 botones en fila (ticket/factura, delivery/retiro, turno).
 *
 * Estaba copiado a mano en cada formulario con clases levemente distintas
 * entre sí. Con una sola versión, el foco y el contraste se arreglan acá y
 * quedan iguales en todos lados.
 */

export type ColorSegmentado = "brand" | "tinta" | "exito";

// Solo estos tres: "brand" (naranja) es el de siempre. "tinta" y "exito" no
// son colores nuevos — son los mismos que ya usan los chips de forma de pago
// (Cuentas del mostrador) y los estados de pedido, reutilizados acá para
// distinguir un grupo de otro cuando dos Segmentado quedan uno debajo del
// otro en la misma pantalla (ver Comprobante del POS). A propósito NO se
// tocan "azul" (reservado para navegación, nunca para elegir/confirmar) ni
// "violeta" (reservado para el estado "en despacho" de pedidos).
const ESTILOS_ACTIVO: Record<ColorSegmentado, string> = {
  brand: "border-brand bg-brand-light text-brand-texto",
  tinta: "border-tinta bg-tinta text-papel",
  exito: "border-exito bg-exito-luz text-exito",
};

export function Segmentado<T extends string>({
  opciones,
  valor,
  onChange,
  className = "",
  color = "brand",
  dosColumnas = false,
  uniforme = false,
}: {
  opciones: { value: T; label: string; sublabel?: string }[];
  valor: T;
  onChange: (v: T) => void;
  className?: string;
  color?: ColorSegmentado;
  /** Las opciones en tarjetas de a dos por fila (cuatro opciones = dos filas), en vez de todas en una sola línea. */
  dosColumnas?: boolean;
  /**
   * Todas las tarjetas del mismo tamaño: mismo ancho, el mismo alto (el de la más alta, con o sin segunda línea) y el texto
   * centrado. Es lo que pide el checkout público, donde "Efectivo" (una línea) al lado de "Tarjeta débito · POS al recibir"
   * (dos líneas) se veía desparejo. `dosColumnas` ya lo trae.
   */
  uniforme?: boolean;
}) {
  const parejas = dosColumnas || uniforme;
  return (
    <div className={`${dosColumnas ? "grid auto-rows-fr grid-cols-2" : "flex"} gap-3 ${className}`}>
      {opciones.map((o) => {
        const activo = o.value === valor;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={activo}
            className={`${
              parejas ? "flex min-h-[3.5rem] min-w-0 flex-col items-center justify-center break-words text-center" : ""
            } flex-1 rounded-lg border px-3 py-2 text-[0.85rem] font-medium transition-colors duration-150 ${
              activo ? ESTILOS_ACTIVO[color] : "border-linea text-tinta-media hover:border-brand/40"
            }`}
          >
            {o.label}
            {o.sublabel && (
              // Sin color propio: hereda el de arriba (currentColor) a menor
              // opacidad, así funciona igual sea cual sea el color activo.
              <span className={`block text-[0.72rem] font-normal ${activo ? "opacity-75" : "text-tinta-suave"}`}>
                {o.sublabel}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
