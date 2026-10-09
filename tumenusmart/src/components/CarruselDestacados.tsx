"use client";

import { formatearGuarani } from "@/lib/format";
import { IconoFoto } from "./iconos";

type Producto = {
  id: string;
  nombre: string;
  precio: number;
  precioNormal?: number;
  enPromocion?: boolean;
  etiquetaPromo?: string;
  imagenUrl: string | null;
};

/**
 * Los más pedidos, en una tira que se desliza con el dedo.
 *
 * Antes esto era un carrusel de a uno, con flechas para pasar. Se cambió por
 * una tira porque en el celular deslizar es más natural que apretar una flecha,
 * y porque mostrar tres a la vez deja comparar — que es justo lo que hace el
 * cliente cuando todavía no decidió qué va a pedir. Al tocar uno, la carta baja hasta ese producto.
 */
export function CarruselDestacados({ productos }: { productos: Producto[] }) {
  if (productos.length === 0) return null;

  return (
    <section className="mt-7" aria-label="Los más pedidos">
      <h2 className="text-[1.25rem] font-semibold tracking-titular text-tinta">Los más pedidos</h2>

      <div className="-mx-4 mt-3 flex gap-3 overflow-x-auto px-4 pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {productos.map((p) => (
          <a
            key={p.id}
            href={`#producto-${p.id}`}
            className="w-40 flex-none overflow-hidden rounded-2xl bg-superficie shadow-sm ring-1 ring-linea transition-all active:scale-[0.98]"
          >
            {p.imagenUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={p.imagenUrl}
                alt={p.nombre}
                loading="lazy"
                decoding="async"
                className="h-28 w-full object-cover"
              />
            ) : (
              <span
                aria-hidden="true"
                className="flex h-28 w-full items-center justify-center bg-papel-hundido text-tinta-suave/35"
              >
                <IconoFoto />
              </span>
            )}
            <span className="block p-3">
              <span className="line-clamp-2 block text-[0.9rem] font-semibold leading-tight tracking-titular text-tinta">
                {p.nombre}
              </span>
              <span className="cifra mt-1.5 block text-[0.92rem] font-bold text-brand-texto">
                {formatearGuarani(p.precio)}
              </span>
              {(p.enPromocion || p.etiquetaPromo) && (
                <span className="mt-1.5 inline-block rounded-full bg-exito-luz px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-rotulo text-exito">
                  {p.etiquetaPromo ?? "Promo"}
                </span>
              )}
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}
