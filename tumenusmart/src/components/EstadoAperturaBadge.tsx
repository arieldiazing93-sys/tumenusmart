import type { EstadoTienda } from "@/lib/estado-tienda";

/** Mismo estilo de trazo que los íconos del menú admin (iconos.tsx): sin
 * relleno, mismo grosor — para que se lea como parte del mismo sistema. */
function IconoReloj() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-[14px] w-[14px] flex-none"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  );
}

/**
 * "Abierto / Cerrado" en la cabecera del menú público.
 *
 * No muestra nada si el negocio todavía no cargó su horario: decir "Abierto"
 * sin tener horario configurado sería una promesa vacía, y el cliente que
 * manda un pedido a las 3 de la mañana confiando en ese cartel no vuelve.
 *
 * Va como píldora con fondo e ícono, no como texto suelto: así se reconoce
 * de un vistazo en el encabezado en vez de perderse entre el nombre y la
 * descripción del negocio.
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
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[0.8rem] font-semibold ${
        abierto
          ? "border-exito/25 bg-exito-luz text-exito"
          : "border-linea bg-papel-suave text-tinta-media"
      }`}
    >
      <IconoReloj />
      {abierto ? "Abierto ahora" : "Cerrado"}
      {detalle && (
        <>
          <span aria-hidden="true" className="opacity-50">
            ·
          </span>
          {detalle}
        </>
      )}
    </span>
  );
}
