"use client";

import { useMemo, useState } from "react";
import { formatearGuarani } from "@/lib/format";
import { MAX_SERVICIOS_POR_CITA, type CategoriaPublica, type ServicioPublico } from "@/lib/reserva-cliente";
import { textoDuracion } from "@/lib/servicios-agenda";
import { IconoBuscar, IconoCheck, IconoChevron, IconoReloj } from "../Iconos";

/** Sin tildes ni mayúsculas, para que "barba" encuentre "Bárbara". */
function sinTildes(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/** "Gs. 45.000", o "Desde Gs. 45.000" si es un precio de partida. */
export function textoPrecioServicio(s: Pick<ServicioPublico, "precio" | "tipoPrecio">): string {
  return `${s.tipoPrecio === "desde" ? "Desde " : ""}${formatearGuarani(s.precio)}`;
}

/**
 * Paso 1: elegir uno o varios servicios. Están agrupados por categoría (que se
 * pueden cerrar) y hay un buscador. Cada servicio es una tarjeta que se marca al tocarla.
 */
export function PasoServicios({
  categorias,
  elegidos,
  onCambiar,
}: {
  categorias: CategoriaPublica[];
  elegidos: string[];
  onCambiar: (ids: string[]) => void;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);

  const visibles = useMemo(() => {
    const q = sinTildes(busqueda.trim());
    if (!q) return categorias;
    return categorias
      .map((c) => ({ ...c, servicios: c.servicios.filter((s) => sinTildes(s.nombre).includes(q)) }))
      .filter((c) => c.servicios.length > 0);
  }, [categorias, busqueda]);

  function alternar(id: string) {
    setAviso(null);
    if (elegidos.includes(id)) {
      onCambiar(elegidos.filter((x) => x !== id));
      return;
    }
    if (elegidos.length >= MAX_SERVICIOS_POR_CITA) {
      setAviso(`Podés elegir hasta ${MAX_SERVICIOS_POR_CITA} servicios por cita.`);
      return;
    }
    onCambiar([...elegidos, id]);
  }

  if (categorias.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-linea bg-papel-suave px-5 py-10 text-center text-[0.9rem] text-tinta-media">
        Todavía no hay servicios disponibles para reservar. Comunicate directamente con el negocio.
      </p>
    );
  }

  return (
    <div>
      <div className="relative">
        <IconoBuscar tam={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-tinta-suave" />
        <input
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar servicios…"
          aria-label="Buscar servicios"
          className="h-12 w-full rounded-2xl bg-papel-hundido pr-4 text-[0.95rem] text-tinta ring-1 ring-transparent placeholder:text-tinta-suave focus:bg-superficie focus:outline-none focus:ring-2 focus:ring-brand"
          style={{ paddingLeft: "2.75rem" }}
        />
      </div>

      {aviso && <p className="mt-3 text-[0.84rem] font-medium text-peligro">{aviso}</p>}

      {visibles.length === 0 ? (
        <p className="mt-6 text-center text-[0.9rem] text-tinta-media">Ningún servicio coincide con esa búsqueda.</p>
      ) : (
        <div>
          {visibles.map((c) => (
            <details key={c.id} open className="group mt-6 first:mt-5">
              <summary className="flex cursor-pointer list-none items-center gap-2.5 px-1 pb-2.5 [&::-webkit-details-marker]:hidden">
                <span className="min-w-0 flex-1 truncate text-[1.12rem] font-semibold tracking-titular text-tinta">{c.nombre}</span>
                <span className="cifra flex-none rounded-full bg-brand-light px-2.5 py-0.5 text-[0.74rem] font-semibold text-brand-texto">
                  {c.servicios.length}
                </span>
                <IconoChevron className="text-tinta-suave transition-transform duration-200 group-open:rotate-180" />
              </summary>
              <ul className="flex flex-col gap-2.5">
                {c.servicios.map((s) => {
                  const marcado = elegidos.includes(s.id);
                  return (
                    <li key={s.id}>
                      <label
                        className={`flex cursor-pointer items-center gap-3 rounded-2xl p-3.5 shadow-sm transition-all active:scale-[0.99] ${
                          marcado ? "bg-brand/5 ring-2 ring-brand" : "bg-superficie ring-1 ring-linea hover:ring-brand/50"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={marcado}
                          onChange={() => alternar(s.id)}
                          aria-label={`Elegir ${s.nombre}`}
                          className="peer sr-only"
                        />
                        {s.imagenUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={s.imagenUrl} alt="" className="h-[4.5rem] w-[4.5rem] flex-none rounded-xl object-cover object-top" />
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block text-[1rem] font-semibold leading-snug text-tinta">{s.nombre}</span>
                          <span className="mt-0.5 flex items-center gap-1.5 text-[0.82rem] text-tinta-suave">
                            <IconoReloj tam={14} />
                            {textoDuracion(s.duracionMin)}
                          </span>
                          <span className="cifra mt-1 block text-[0.95rem] font-bold text-brand-texto">{textoPrecioServicio(s)}</span>
                        </span>
                        <span
                          aria-hidden="true"
                          className={`flex h-7 w-7 flex-none items-center justify-center rounded-full border-2 transition-all peer-focus-visible:ring-2 peer-focus-visible:ring-brand peer-focus-visible:ring-offset-2 ${
                            marcado ? "border-brand bg-brand text-white" : "border-linea text-transparent"
                          }`}
                        >
                          <IconoCheck tam={16} />
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
