"use client";

import { useEffect, useRef } from "react";
import { Entrada, Tarjeta, clasesBoton } from "@/components/ui";
import { MAX_GALERIA, type ItemGaleria } from "@/lib/pagina-reservas";
import { BotonSubirImagen, PARA_GALERIA } from "./BotonSubirImagen";
import type { PropsSeccion } from "./tipos";

/**
 * Galería de la empresa: hasta 5 fotos (del local, de los peinados más
 * pedidos…), cada una con una breve descripción al pie. En la página se ven de
 * a una, a lo ancho, y se deslizan de costado.
 */
export function SeccionGaleria({ datos, cambiar }: PropsSeccion) {
  const items = datos.galeria;

  // La subida tarda unos segundos: si mientras tanto se editó una descripción,
  // la foto nueva tiene que sumarse a lo último, no a lo que había al tocar el botón.
  const ultimos = useRef(items);
  useEffect(() => {
    ultimos.current = items;
  });

  function actualizar(indice: number, parche: Partial<ItemGaleria>) {
    cambiar({ galeria: items.map((it, i) => (i === indice ? { ...it, ...parche } : it)) });
  }

  function mover(indice: number, paso: -1 | 1) {
    const destino = indice + paso;
    if (destino < 0 || destino >= items.length) return;
    const copia = [...items];
    [copia[indice], copia[destino]] = [copia[destino], copia[indice]];
    cambiar({ galeria: copia });
  }

  return (
    <Tarjeta className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[1rem] font-semibold tracking-titular text-tinta">Galería de la empresa</h3>
          <p className="mt-0.5 text-[0.82rem] text-tinta-media">
            Hasta {MAX_GALERIA} fotos de tu local o de tus mejores trabajos, cada una con una breve descripción.
          </p>
        </div>
        <span className="cifra flex-none rounded-full bg-papel-hundido px-2.5 py-1 text-[0.78rem] font-semibold text-tinta-media">
          {items.length}/{MAX_GALERIA}
        </span>
      </div>

      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-linea bg-papel-suave px-4 py-6 text-center text-[0.85rem] text-tinta-media">
          Todavía no subiste fotos.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((it, i) => (
            <li key={`${it.url}-${i}`} className="flex items-start gap-3 rounded-xl border border-linea bg-superficie p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={it.url} alt="" className="h-20 w-20 flex-none rounded-lg object-cover sm:h-24 sm:w-24" />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <Entrada
                  value={it.descripcion}
                  onChange={(e) => actualizar(i, { descripcion: e.target.value })}
                  maxLength={120}
                  placeholder="Descripción de la foto (opcional)"
                  aria-label={`Descripción de la foto ${i + 1}`}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => mover(i, -1)}
                    disabled={i === 0}
                    aria-label="Subir la foto"
                    className={clasesBoton("suave", "sm")}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => mover(i, 1)}
                    disabled={i === items.length - 1}
                    aria-label="Bajar la foto"
                    className={clasesBoton("suave", "sm")}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => cambiar({ galeria: items.filter((_, j) => j !== i) })}
                    className={`${clasesBoton("peligro", "sm")} ml-auto`}
                  >
                    Quitar
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <BotonSubirImagen
        texto={items.length === 0 ? "Subir la primera foto" : "Añadir foto"}
        opciones={PARA_GALERIA}
        deshabilitado={items.length >= MAX_GALERIA}
        onSubida={(url) => cambiar({ galeria: [...ultimos.current, { url, descripcion: "" }].slice(0, MAX_GALERIA) })}
      />
      {items.length >= MAX_GALERIA && (
        <p className="text-[0.78rem] text-tinta-suave">
          Llegaste al máximo de {MAX_GALERIA} fotos. Quitá una para subir otra.
        </p>
      )}
    </Tarjeta>
  );
}
