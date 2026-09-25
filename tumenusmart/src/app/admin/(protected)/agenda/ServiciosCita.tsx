"use client";

import { EntradaMonto } from "@/components/EntradaMonto";
import { Selector, clasesCampo } from "@/components/ui";
import type { LineaServicioCita, ServicioOpcion } from "@/lib/agenda-cita";
import { formatearGuarani } from "@/lib/format";
import { MAX_SERVICIOS_POR_CITA } from "@/lib/reserva-cliente";
import { textoDuracion } from "@/lib/servicios-agenda";
import { IconoTijera } from "./IconosAgenda";

/**
 * Los servicios de la cita: una tarjeta por servicio, pintada con el color que se le
 * eligió en Servicios, con su duración y su precio (que se puede cambiar en el turno:
 * un "desde", un ajuste). Abajo, un selector para agregar otro. La duración de la
 * cita es la suma de sus servicios.
 */
export function ServiciosCita({
  lineas,
  catalogo,
  onCambio,
}: {
  lineas: LineaServicioCita[];
  catalogo: ServicioOpcion[];
  onCambio: (lineas: LineaServicioCita[]) => void;
}) {
  const usados = new Set(lineas.map((l) => l.servicioId).filter((x): x is string => !!x));
  const disponibles = catalogo.filter((s) => !usados.has(s.id));
  const catalogoPorId = new Map(catalogo.map((s) => [s.id, s] as const));

  // Los que se pueden agregar, agrupados por categoría en el orden del catálogo.
  const grupos: { categoria: string; servicios: ServicioOpcion[] }[] = [];
  for (const s of disponibles) {
    const grupo = grupos.find((g) => g.categoria === s.categoriaNombre);
    if (grupo) grupo.servicios.push(s);
    else grupos.push({ categoria: s.categoriaNombre, servicios: [s] });
  }

  function agregar(id: string) {
    const s = catalogoPorId.get(id);
    if (!s) return;
    onCambio([
      ...lineas,
      {
        clave: `nuevo-${s.id}-${Date.now()}`,
        servicioId: s.id,
        citaServicioId: null,
        nombre: s.nombre,
        categoriaNombre: s.categoriaNombre,
        duracionMin: s.duracionMin,
        precio: s.precio,
        color: s.color,
      },
    ]);
  }

  function cambiarPrecio(clave: string, precio: number) {
    onCambio(lineas.map((l) => (l.clave === clave ? { ...l, precio } : l)));
  }

  function quitar(clave: string) {
    onCambio(lineas.filter((l) => l.clave !== clave));
  }

  const llena = lineas.length >= MAX_SERVICIOS_POR_CITA;
  const minutosTotales = lineas.reduce((suma, l) => suma + l.duracionMin, 0);

  return (
    <div className="flex flex-col gap-2.5">
      {lineas.length === 0 ? (
        <p className="rounded-xl border border-dashed border-pink-300 bg-pink-50/60 px-3 py-5 text-center text-[0.84rem] font-medium text-pink-700">
          Todavía no hay servicios. Agregá al menos uno.
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {lineas.map((l, i) => {
            const delCatalogo = l.servicioId ? catalogoPorId.get(l.servicioId) : undefined;
            const cambioElPrecio = !!delCatalogo && Math.round(delCatalogo.precio) !== Math.round(l.precio);
            return (
              <li
                key={l.clave}
                className="animate-deslizar group rounded-xl border border-l-4 p-3 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
                // El color del servicio: la franja de la izquierda, el borde y un fondo muy suave del mismo tono.
                style={{
                  borderColor: `${l.color}66`,
                  borderLeftColor: l.color,
                  backgroundColor: `${l.color}14`,
                  animationDelay: `${Math.min(i, 6) * 45}ms`,
                }}
              >
                <div className="flex items-start gap-2.5">
                  <span
                    aria-hidden="true"
                    className="mt-0.5 flex h-9 w-9 flex-none items-center justify-center rounded-xl text-white shadow-sm transition-transform duration-200 group-hover:rotate-6 group-hover:scale-105"
                    style={{ backgroundColor: l.color }}
                  >
                    <IconoTijera tam={17} />
                  </span>

                  <div className="min-w-0 flex-1">
                    {l.categoriaNombre && (
                      <p className="truncate text-[0.7rem] font-semibold uppercase tracking-wide text-tinta-suave">
                        {l.categoriaNombre}
                      </p>
                    )}
                    <p className="text-[0.92rem] font-semibold leading-snug text-tinta">{l.nombre}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[0.74rem] text-tinta-media">
                      <span className="rounded-full bg-white/80 px-2 py-0.5 font-semibold">{textoDuracion(l.duracionMin)}</span>
                      {delCatalogo && (
                        <span className={cambioElPrecio ? "text-tinta-suave line-through" : "text-tinta-suave"}>
                          {formatearGuarani(delCatalogo.precio)}
                        </span>
                      )}
                      {cambioElPrecio && <span className="font-semibold text-amber-700">precio ajustado</span>}
                    </p>
                    {delCatalogo?.tipoPrecio === "desde" && (
                      <p className="mt-1.5 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[0.7rem] font-semibold text-amber-800">
                        Precio “desde”: ajustalo al monto final
                      </p>
                    )}
                  </div>

                  {/* El ancho lo da este contenedor: el campo ocupa todo su ancho. */}
                  <div className="w-28 flex-none">
                    <EntradaMonto
                      value={String(Math.round(l.precio))}
                      onChange={(v) => cambiarPrecio(l.clave, Number(v || 0))}
                      className={`${clasesCampo} text-right font-bold`}
                      placeholder="0"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => quitar(l.clave)}
                    aria-label={`Quitar ${l.nombre}`}
                    title="Quitar servicio"
                    className="flex h-9 w-9 flex-none items-center justify-center rounded-lg text-tinta-suave transition-all hover:bg-red-100 hover:text-red-600 active:scale-90"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      width={16}
                      height={16}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {lineas.length > 0 && (
        <p className="flex items-center justify-between rounded-lg bg-sky-50 px-3 py-2 text-[0.8rem] font-medium text-sky-800">
          <span>
            {lineas.length} {lineas.length === 1 ? "servicio" : "servicios"}
          </span>
          <span>
            Dura <strong className="font-bold">{textoDuracion(minutosTotales)}</strong> en total
          </span>
        </p>
      )}

      {llena ? (
        <p className="text-[0.78rem] text-tinta-suave">Llegaste al máximo de {MAX_SERVICIOS_POR_CITA} servicios por cita.</p>
      ) : catalogo.length === 0 ? (
        <p className="text-[0.8rem] text-tinta-media">
          Todavía no hay servicios cargados. Se crean en Reserva de turnos → Servicios.
        </p>
      ) : disponibles.length > 0 ? (
        <div className="rounded-xl border-2 border-dashed border-pink-300 bg-pink-50/70 p-2 transition-colors hover:border-pink-400 hover:bg-pink-50">
          <Selector
            value=""
            onChange={(e) => {
              if (e.target.value) agregar(e.target.value);
            }}
            aria-label="Agregar un servicio"
          >
            <option value="">＋ Agregar un servicio…</option>
            {grupos.map((g) => (
              <optgroup key={g.categoria} label={g.categoria}>
                {g.servicios.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre} · {textoDuracion(s.duracionMin)} · {formatearGuarani(s.precio)}
                  </option>
                ))}
              </optgroup>
            ))}
          </Selector>
        </div>
      ) : null}
    </div>
  );
}
