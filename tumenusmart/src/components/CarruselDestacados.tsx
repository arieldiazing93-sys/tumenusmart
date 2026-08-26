"use client";

import { formatearGuarani } from "@/lib/format";

type Producto = {
  id: string;
  nombre: string;
  precio: number;
  imagenUrl: string | null;
};

/**
 * Los más pedidos, en una tira que se desliza con el dedo.
 *
 * Antes esto era un carrusel de a uno, con flechas para pasar. Se cambió por
 * una tira porque en el celular deslizar es más natural que apretar una flecha,
 * y porque mostrar tres a la vez deja comparar — que es justo lo que hace el
 * cliente cuando todavía no decidió qué va a pedir.
 */
export function CarruselDestacados({ productos }: { productos: Producto[] }) {
  if (productos.length === 0) return null;

  return (
    <section className="mt-6 border-b border-linea-fina pb-5">
      <p className="rotulo">Los más pedidos</p>

      <div className="-mx-4 mt-2.5 flex gap-2.5 overflow-x-auto px-4 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {productos.map((p) => (
          <a
            key={p.id}
            href={`#producto-${p.id}`}
            className="w-[136px] flex-none overflow-hidden rounded-xl border border-linea bg-white transition-colors hover:border-brand"
          >
            {p.imagenUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={p.imagenUrl}
                alt={p.nombre}
                loading="lazy"
                decoding="async"
                className="h-20 w-full object-cover"
              />
            ) : (
              <span aria-hidden="true" className="block h-20 w-full bg-papel-hundido" />
            )}
            <span className="block px-2 pb-2.5 pt-1.5">
              <span className="block text-[0.78rem] font-semibold leading-tight tracking-titular">
                {p.nombre}
              </span>
              <span className="cifra mt-1 block text-[0.75rem] text-tinta-media">
                {formatearGuarani(p.precio)}
              </span>
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}
