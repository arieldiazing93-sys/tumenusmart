"use client";

import { useMemo, useState } from "react";
import { formatearGuarani } from "@/lib/format";
import { MAX_SERVICIOS_POR_CITA, type CategoriaPublica, type ServicioPublico } from "@/lib/reserva-cliente";
import { textoDuracion } from "@/lib/servicios-agenda";

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
 * pueden cerrar) y hay un buscador. Un servicio se marca con su casilla.
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
      <p className="rounded-xl border border-dashed border-linea bg-papel-suave px-5 py-10 text-center text-[0.9rem] text-tinta-media">
        Todavía no hay servicios disponibles para reservar. Comunicate directamente con el negocio.
      </p>
    );
  }

  return (
    <div>
      <div className="relative">
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
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-tinta-suave"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar servicios…"
          aria-label="Buscar servicios"
          className="w-full rounded-xl border border-linea bg-superficie py-3 pr-3 text-[0.9rem] text-tinta placeholder:text-tinta-suave focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15"
          style={{ paddingLeft: "2.5rem" }}
        />
      </div>

      {aviso && <p className="mt-3 text-[0.82rem] font-medium text-peligro">{aviso}</p>}

      {visibles.length === 0 ? (
        <p className="mt-6 text-center text-[0.88rem] text-tinta-media">Ningún servicio coincide con esa búsqueda.</p>
      ) : (
        <div className="mt-2">
          {visibles.map((c) => (
            <details key={c.id} open className="group mt-4 first:mt-2">
              {/* La franja de cada categoría va de borde a borde y toma el color que el negocio eligió
                  en Apariencia (un tinte suave de ese color, que sirve igual en tema claro y oscuro). */}
              <summary className="-mx-4 flex cursor-pointer list-none items-center gap-3 border-y border-brand/25 bg-brand/15 px-4 py-3.5 [&::-webkit-details-marker]:hidden">
                <span aria-hidden="true" className="h-5 w-1 flex-none rounded-full bg-brand" />
                <span className="min-w-0 flex-1 truncate text-[0.98rem] font-semibold text-tinta">{c.nombre}</span>
                <span className="cifra flex-none rounded-full bg-brand px-2 py-0.5 text-[0.72rem] font-semibold text-white">
                  {c.servicios.length}
                </span>
                <svg
                  viewBox="0 0 24 24"
                  width={18}
                  height={18}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  className="text-tinta-suave transition-transform duration-200 group-open:rotate-180"
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </summary>
              <ul>
                {c.servicios.map((s) => {
                  const marcado = elegidos.includes(s.id);
                  return (
                    <li key={s.id}>
                      <label
                        className={`flex cursor-pointer items-center gap-3 rounded-lg px-2 py-3.5 transition-colors ${
                          marcado ? "bg-brand/10" : "hover:bg-papel-suave"
                        }`}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block text-[0.95rem] font-medium text-tinta">{s.nombre}</span>
                          <span className="block text-[0.8rem] text-tinta-suave">{textoDuracion(s.duracionMin)}</span>
                        </span>
                        <span className="cifra flex-none text-[0.88rem] font-medium text-tinta">
                          {textoPrecioServicio(s)}
                        </span>
                        <input
                          type="checkbox"
                          checked={marcado}
                          onChange={() => alternar(s.id)}
                          aria-label={`Elegir ${s.nombre}`}
                          className="h-5 w-5 flex-none accent-brand"
                        />
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
