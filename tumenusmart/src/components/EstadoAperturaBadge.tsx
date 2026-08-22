import type { EstadoTienda } from "@/lib/estado-tienda";

/**
 * Distintivo "Abierto / Cerrado" para la cabecera del menú público.
 * No muestra nada si el negocio todavía no cargó su horario — decir
 * "Abierto" sin tener horario configurado sería una promesa vacía.
 */
export function EstadoAperturaBadge({ estado }: { estado: EstadoTienda }) {
  if (!estado.tieneHorarios) return null;

  const abierto = estado.abierto;

  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
          abierto ? "bg-green-100 text-green-800" : "bg-neutral-200 text-neutral-600"
        }`}
      >
        <span
          className={`h-1.5 w-1.5 rounded-full ${abierto ? "bg-green-600" : "bg-neutral-500"}`}
        />
        {abierto ? "Abierto" : "Cerrado"}
      </span>

      <span className="text-xs text-neutral-500">
        {abierto
          ? estado.horarioDeHoy !== "Cerrado"
            ? `Hoy ${estado.horarioDeHoy}`
            : null
          : estado.proximaApertura
            ? `Abre ${estado.proximaApertura}`
            : null}
      </span>
    </div>
  );
}
