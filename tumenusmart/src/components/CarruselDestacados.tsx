"use client";

import { useEffect, useState } from "react";
import { formatearGuarani } from "@/lib/format";

type ProductoDestacado = {
  id: string;
  nombre: string;
  precio: number;
  imagenUrl: string | null;
};

// Banner giratorio de productos marcados como "destacado" — pensado para
// el producto estrella del negocio. Cambia solo cada 2.5s, entrando desde
// la izquierda. Sin librerías: un solo item visible a la vez + intervalo.
export function CarruselDestacados({ productos }: { productos: ProductoDestacado[] }) {
  const [indice, setIndice] = useState(0);

  useEffect(() => {
    if (productos.length <= 1) return;
    const id = setInterval(() => {
      setIndice((i) => (i + 1) % productos.length);
    }, 2500);
    return () => clearInterval(id);
  }, [productos.length]);

  if (productos.length === 0) return null;

  const producto = productos[indice % productos.length];

  return (
    <div className="mb-8 overflow-hidden rounded-xl border border-brand/30 bg-brand-light">
      <div key={producto.id} className="flex animate-destacado-entrada items-center gap-4 p-4">
        {producto.imagenUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={producto.imagenUrl}
            alt={producto.nombre}
            className="h-16 w-16 flex-none rounded-lg object-cover"
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-dark">
            ⭐ Producto destacado
          </p>
          <p className="truncate font-semibold text-neutral-900">{producto.nombre}</p>
          <p className="text-sm text-neutral-600">{formatearGuarani(producto.precio)}</p>
        </div>
        {productos.length > 1 && (
          <div className="flex flex-none gap-1">
            {productos.map((p, i) => (
              <span
                key={p.id}
                className={`h-1.5 w-1.5 rounded-full ${
                  i === indice % productos.length ? "bg-brand" : "bg-brand/30"
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
