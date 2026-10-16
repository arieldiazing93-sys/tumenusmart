"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { IconoPlegar } from "@/components/iconos";

const CHIP_ACTIVO = "border-brand bg-brand text-white";
const CHIP_INACTIVO = "border-linea bg-white text-tinta-media hover:border-brand hover:text-brand";

/**
 * Alto de cada grupo y espacio entre filas: fijos a propósito (y en estilos en línea, no en clases), así la ventana de «dos filas» mide
 * siempre lo mismo y cada página empieza justo en el borde de una fila, sin cortar ningún grupo por la mitad.
 */
const ALTO_GRUPO = "2.25rem";
const ESPACIO = "0.5rem";
const FILAS_POR_PAGINA = 2;

export type GrupoDeLaCarta = { id: string; nombre: string; cantidad: number };

/**
 * Los grupos de la carta (categorías) del punto de venta, en un máximo de DOS filas para no gastar pantalla: si no entran todos, aparecen
 * unas flechas al costado para pasar a la página siguiente (otras dos filas de grupos). El ancho decide cuántos entran por fila, así
 * que las páginas se recalculan solas al cambiar el tamaño de la ventana.
 *
 * Los grupos de las otras páginas no se sacan: quedan escondidos con la fila corrida (desplazamiento), así el orden es el de siempre.
 */
export function FilaDeGrupos({
  grupos,
  activo,
  onElegir,
}: {
  grupos: GrupoDeLaCarta[];
  /** El grupo elegido; "" = ninguno resaltado (por ejemplo, mientras se busca un producto por su nombre). */
  activo: string;
  onElegir: (id: string) => void;
}) {
  const ventana = useRef<HTMLDivElement>(null);
  const [pagina, setPagina] = useState(0);
  const [paginas, setPaginas] = useState(1);

  /** La altura en que empieza cada fila (los grupos de una misma fila comparten la suya). */
  const alturasDeFilas = useCallback((): number[] => {
    const v = ventana.current;
    if (!v) return [];
    const tops = [...v.querySelectorAll<HTMLElement>("[data-grupo]")].map((c) => c.offsetTop);
    return [...new Set(tops)].sort((a, b) => a - b);
  }, []);

  const medir = useCallback(() => {
    const total = Math.max(1, Math.ceil(alturasDeFilas().length / FILAS_POR_PAGINA));
    setPaginas(total);
    setPagina((p) => Math.min(p, total - 1));
  }, [alturasDeFilas]);

  // Las páginas se vuelven a contar cuando cambian los grupos y cuando cambia el ancho (más ancho = más grupos por fila).
  useEffect(() => {
    medir();
    const v = ventana.current;
    if (!v || typeof ResizeObserver === "undefined") return;
    const observador = new ResizeObserver(() => medir());
    observador.observe(v);
    return () => observador.disconnect();
  }, [grupos, medir]);

  // Pasar de página = correr la ventana hasta la primera fila de esa página.
  useEffect(() => {
    const v = ventana.current;
    if (!v) return;
    const filas = alturasDeFilas();
    if (filas.length === 0) return;
    const primera = filas[Math.min(pagina * FILAS_POR_PAGINA, filas.length - 1)];
    v.scrollTo({ top: primera - filas[0], behavior: "smooth" });
  }, [pagina, paginas, alturasDeFilas]);

  const boton =
    "flex h-9 w-9 flex-none items-center justify-center rounded-full border border-azul/35 bg-azul-luz text-azul-oscuro transition-colors " +
    "hover:border-azul hover:bg-azul hover:text-white disabled:pointer-events-none disabled:opacity-40";

  return (
    <div className="mb-4" style={{ display: "flex", alignItems: "flex-start", gap: ESPACIO }}>
      {/* Los grupos, en filas; la ventana muestra solo dos y esconde el resto (overflow oculto) hasta pasar de página. */}
      <div
        ref={ventana}
        role="group"
        aria-label="Grupos de la carta"
        style={{
          position: "relative",
          display: "flex",
          flexWrap: "wrap",
          alignContent: "flex-start",
          flex: "1 1 0%",
          minWidth: 0,
          gap: ESPACIO,
          overflow: "hidden",
          maxHeight: `calc(${FILAS_POR_PAGINA} * ${ALTO_GRUPO} + ${FILAS_POR_PAGINA - 1} * ${ESPACIO})`,
        }}
      >
        {grupos.map((g) => {
          const esActivo = g.id === activo;
          return (
            <button
              key={g.id}
              type="button"
              data-grupo=""
              aria-pressed={esActivo}
              onClick={() => onElegir(g.id)}
              style={{ height: ALTO_GRUPO, flex: "none", maxWidth: "100%" }}
              className={`inline-flex items-center whitespace-nowrap rounded-full border px-3.5 text-[0.85rem] font-medium transition-colors ${
                esActivo ? CHIP_ACTIVO : CHIP_INACTIVO
              }`}
            >
              <span className="truncate">{g.nombre}</span>
              <span className={`ml-1.5 ${esActivo ? "text-white/80" : "text-tinta-suave"}`}>{g.cantidad}</span>
            </button>
          );
        })}
        {/* Con más de una página, un espacio vacío al final: así la última página puede arrancar en el borde de su fila aunque le quede
            una sola fila de grupos (sin él, la ventana no se podría correr tanto y mostraría la fila anterior). */}
        {paginas > 1 && (
          <div
            aria-hidden="true"
            style={{ flex: "0 0 100%", height: `calc(${FILAS_POR_PAGINA} * ${ALTO_GRUPO} + ${FILAS_POR_PAGINA - 1} * ${ESPACIO})` }}
          />
        )}
      </div>

      {paginas > 1 && (
        <div
          style={{ display: "flex", alignItems: "center", gap: "0.375rem", flex: "none", height: ALTO_GRUPO }}
          role="group"
          aria-label="Cambiar de página de grupos"
        >
          <button
            type="button"
            onClick={() => setPagina((p) => Math.max(0, p - 1))}
            disabled={pagina === 0}
            aria-label="Grupos anteriores"
            title="Grupos anteriores"
            className={boton}
          >
            <IconoPlegar />
          </button>
          <span className="cifra min-w-[2.2rem] text-center text-[0.78rem] font-semibold text-tinta-media">
            {pagina + 1}/{paginas}
          </span>
          <button
            type="button"
            onClick={() => setPagina((p) => Math.min(paginas - 1, p + 1))}
            disabled={pagina >= paginas - 1}
            aria-label="Grupos siguientes"
            title="Grupos siguientes"
            className={boton}
          >
            <IconoPlegar className="rotate-180" />
          </button>
        </div>
      )}
    </div>
  );
}
