import type { ReactNode } from "react";
import type { ActividadCita as Movimiento, TonoActividad } from "@/lib/agenda-cita";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import { IconoCerrar, IconoEstado, IconoLapiz, IconoMas, IconoTilde } from "./IconosAgenda";

/** Cada tipo de movimiento con su color: creada en violeta, cobro en verde, anulado en rojo, estado en azul, cambio en ámbar. */
const ESTILO: Record<TonoActividad, { circulo: string; tarjeta: string; icono: ReactNode }> = {
  creada: {
    circulo: "bg-violet-500",
    tarjeta: "border-violet-200 border-l-violet-500 bg-violet-50/60",
    icono: <IconoMas tam={14} />,
  },
  cobro: {
    circulo: "bg-emerald-500",
    tarjeta: "border-emerald-200 border-l-emerald-500 bg-emerald-50/60",
    icono: <IconoTilde tam={14} />,
  },
  anulado: {
    circulo: "bg-red-500",
    tarjeta: "border-red-200 border-l-red-500 bg-red-50/60",
    icono: <IconoCerrar tam={14} />,
  },
  estado: {
    circulo: "bg-blue-500",
    tarjeta: "border-sky-200 border-l-blue-500 bg-sky-50/60",
    icono: <IconoEstado estado="proxima" tam={14} />,
  },
  edicion: {
    circulo: "bg-amber-500",
    tarjeta: "border-amber-200 border-l-amber-500 bg-amber-50/60",
    icono: <IconoLapiz tam={13} />,
  },
};

function cuando(iso: string): string {
  return new Date(iso).toLocaleString("es-PY", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: ZONA_NEGOCIO,
  });
}

/**
 * La pestaña Actividad de la cita: quién hizo qué y cuándo (cómo se pidió, cambios de
 * estado, el cobro…). Lo más nuevo, arriba, cada movimiento con el color de lo que fue.
 */
export function ActividadCita({ actividad }: { actividad: Movimiento[] }) {
  return (
    <div className="flex-1 overflow-y-auto bg-papel-suave px-5 py-5">
      {actividad.length === 0 ? (
        <p className="rounded-xl border border-dashed border-linea bg-superficie px-4 py-8 text-center text-[0.85rem] text-tinta-media">
          Todavía no hay actividad registrada para esta cita.
        </p>
      ) : (
        <ol className="flex flex-col gap-3">
          {actividad.map((m, i) => {
            const estilo = ESTILO[m.tono];
            return (
              <li
                key={`${m.cuando}-${i}`}
                className="animate-deslizar flex items-start gap-3"
                style={{ animationDelay: `${Math.min(i, 8) * 50}ms` }}
              >
                <span
                  aria-hidden="true"
                  className={`mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-full text-white shadow ${estilo.circulo}`}
                >
                  {estilo.icono}
                </span>
                <div className={`min-w-0 flex-1 rounded-xl border border-l-4 px-3 py-2.5 shadow-sm ${estilo.tarjeta}`}>
                  <p className="text-[0.86rem] leading-snug text-tinta">{m.texto}</p>
                  <p className="mt-1 text-[0.74rem] text-tinta-suave">
                    {m.quien} · <span className="cifra">{cuando(m.cuando)}</span>
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
