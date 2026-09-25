import type { ActividadCita as Movimiento } from "@/lib/agenda-cita";
import { ZONA_NEGOCIO } from "@/lib/timezone";

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
 * estado, el cobro…). Lo más nuevo, arriba.
 */
export function ActividadCita({ actividad }: { actividad: Movimiento[] }) {
  return (
    <div className="flex-1 overflow-y-auto px-5 py-5">
      {actividad.length === 0 ? (
        <p className="rounded-lg border border-dashed border-linea bg-papel-suave px-4 py-8 text-center text-[0.85rem] text-tinta-media">
          Todavía no hay actividad registrada para esta cita.
        </p>
      ) : (
        <ol className="flex flex-col">
          {actividad.map((m, i) => (
            <li key={`${m.cuando}-${i}`} className="relative flex gap-3 pb-5 last:pb-0">
              {/* La línea que une los movimientos. */}
              {i < actividad.length - 1 && (
                <span aria-hidden="true" className="absolute left-[0.3rem] top-3 h-full w-px bg-linea" />
              )}
              <span aria-hidden="true" className="relative mt-1.5 h-2.5 w-2.5 flex-none rounded-full bg-azul" />
              <div className="min-w-0">
                <p className="text-[0.86rem] leading-snug text-tinta">{m.texto}</p>
                <p className="mt-0.5 text-[0.74rem] text-tinta-suave">
                  {m.quien} · <span className="cifra">{cuando(m.cuando)}</span>
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
