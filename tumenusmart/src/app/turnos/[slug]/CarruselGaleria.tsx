"use client";

import { useRef, useState } from "react";

/**
 * La galería de fotos de la página de reservas: una foto a lo ancho por vez, que
 * se desliza de costado con el dedo (o con las flechas y los puntos), y con su
 * descripción al pie. Usa el desplazamiento nativo del navegador con "imán"
 * (scroll-snap): es fluido en el celular y no necesita ninguna librería.
 */
export function CarruselGaleria({ items }: { items: { url: string; descripcion: string }[] }) {
  const pista = useRef<HTMLDivElement>(null);
  const [actual, setActual] = useState(0);

  function alDeslizar() {
    const el = pista.current;
    if (!el || el.clientWidth === 0) return;
    setActual(Math.round(el.scrollLeft / el.clientWidth));
  }

  function ir(indice: number) {
    const el = pista.current;
    if (!el) return;
    const destino = Math.min(items.length - 1, Math.max(0, indice));
    el.scrollTo({ left: destino * el.clientWidth, behavior: "smooth" });
  }

  return (
    <div>
      <div className="relative">
        <div
          ref={pista}
          onScroll={alDeslizar}
          role="region"
          aria-label="Galería de fotos"
          tabIndex={0}
          className="flex snap-x snap-mandatory overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {items.map((it, i) => (
            <figure key={`${it.url}-${i}`} className="w-full flex-none snap-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={it.url}
                alt={it.descripcion || `Foto ${i + 1}`}
                loading={i === 0 ? "eager" : "lazy"}
                className="aspect-[4/3] w-full rounded-xl object-cover"
              />
              {it.descripcion && (
                <figcaption className="mt-2.5 px-1 text-center text-[0.88rem] leading-snug text-tinta-media">
                  {it.descripcion}
                </figcaption>
              )}
            </figure>
          ))}
        </div>

        {items.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => ir(actual - 1)}
              disabled={actual === 0}
              aria-label="Foto anterior"
              className="absolute left-2 top-[38%] flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-papel/90 text-tinta shadow backdrop-blur transition-opacity disabled:opacity-0"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => ir(actual + 1)}
              disabled={actual === items.length - 1}
              aria-label="Foto siguiente"
              className="absolute right-2 top-[38%] flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-papel/90 text-tinta shadow backdrop-blur transition-opacity disabled:opacity-0"
            >
              ›
            </button>
          </>
        )}
      </div>

      {items.length > 1 && (
        <div className="mt-3 flex items-center justify-center gap-2" role="tablist" aria-label="Elegir foto">
          {items.map((_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === actual}
              aria-label={`Foto ${i + 1} de ${items.length}`}
              onClick={() => ir(i)}
              className={`h-2 rounded-full transition-all duration-200 ${
                i === actual ? "w-6 bg-brand" : "w-2 bg-tinta-suave/40"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
