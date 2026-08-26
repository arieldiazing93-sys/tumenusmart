import type { EstadoTienda } from "@/lib/estado-tienda";

/**
 * "Abierto / Cerrado" en la cabecera del menú público.
 *
 * No muestra nada si el negocio todavía no cargó su horario: decir "Abierto"
 * sin tener horario configurado sería una promesa vacía, y el cliente que
 * manda un pedido a las 3 de la mañana confiando en ese cartel no vuelve.
 */
export function EstadoAperturaBadge({ estado }: { estado: EstadoTienda }) {
  if (!estado.tieneHorarios) return null;

  const abierto = estado.abierto;
  const detalle = abierto
    ? estado.horarioDeHoy !== "Cerrado"
      ? `Hoy ${estado.horarioDeHoy}`
      : null
    : estado.proximaApertura
      ? `Abre ${estado.proximaApertura}`
      : null;

  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5">
      <span
        className={`inline-flex items-center gap-1.5 text-[0.8rem] font-semibold ${
          abierto ? "text-exito" : "text-tinta-suave"
        }`}
      >
        <span
          aria-hidden="true"
          className={`h-[7px] w-[7px] rounded-full ${abierto ? "bg-exito" : "bg-tinta-suave"}`}
        />
        {abierto ? "Abierto ahora" : "Cerrado"}
      </span>

      {detalle && (
        <>
          <span aria-hidden="true" className="text-linea">
            ·
          </span>
          <span className="text-[0.8rem] text-tinta-suave">{detalle}</span>
        </>
      )}
    </span>
  );
}
