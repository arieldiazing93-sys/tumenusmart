"use client";

import { useState } from "react";
import { useCart } from "./CartProvider";
import { construirKey } from "@/lib/cart-types";
import { formatearGuarani } from "@/lib/format";

type ProductoDestacado = {
  id: string;
  nombre: string;
  precio: number;
  imagenUrl: string | null;
  /** si tiene variantes (ej. tamaños/sabores), hay que elegir una — no se
   * puede agregar directo desde el carrusel, se manda al menú de abajo. */
  tieneVariantes: boolean;
};

// Banner de productos marcados como "destacado" — el/los producto(s)
// estrella del negocio. Navegación 100% manual (‹ › y puntitos, sin
// avance automático) y con botón propio para agregar al carrito, para que
// el cliente pueda pedir el destacado sin tener que buscarlo en el menú.
export function CarruselDestacados({ productos }: { productos: ProductoDestacado[] }) {
  const { agregarItem } = useCart();
  const [indice, setIndice] = useState(0);
  const [agregado, setAgregado] = useState(false);

  if (productos.length === 0) return null;

  const total = productos.length;
  const producto = productos[indice % total];

  function anterior() {
    setIndice((i) => (i - 1 + total) % total);
    setAgregado(false);
  }

  function siguiente() {
    setIndice((i) => (i + 1) % total);
    setAgregado(false);
  }

  function agregarAlCarrito() {
    agregarItem({
      key: construirKey(producto.id, [], []),
      productId: producto.id,
      nombreProducto: producto.nombre,
      precioBase: producto.precio,
      opciones: [],
      cantidad: 1,
      imagenUrl: producto.imagenUrl,
    });
    setAgregado(true);
    setTimeout(() => setAgregado(false), 1500);
  }

  return (
    <div className="mb-8 overflow-hidden rounded-xl border border-brand/30 bg-brand-light">
      <div className="flex items-center gap-1 p-3">
        {total > 1 && (
          <button
            type="button"
            onClick={anterior}
            aria-label="Producto anterior"
            className="flex-none rounded-full px-2 py-3 text-lg font-bold text-brand-dark hover:bg-white/60"
          >
            ‹
          </button>
        )}

        <div className="flex flex-1 items-center gap-3">
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

          {producto.tieneVariantes ? (
            <a
              href={`#producto-${producto.id}`}
              className="flex-none rounded-lg border border-brand px-3 py-1.5 text-center text-sm font-medium text-brand hover:bg-white"
            >
              Ver opciones
            </a>
          ) : (
            <button
              type="button"
              onClick={agregarAlCarrito}
              className="flex-none rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark"
            >
              {agregado ? "Agregado ✓" : "Agregar"}
            </button>
          )}
        </div>

        {total > 1 && (
          <button
            type="button"
            onClick={siguiente}
            aria-label="Siguiente producto"
            className="flex-none rounded-full px-2 py-3 text-lg font-bold text-brand-dark hover:bg-white/60"
          >
            ›
          </button>
        )}
      </div>

      {total > 1 && (
        <div className="flex justify-center gap-1.5 pb-3">
          {productos.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                setIndice(i);
                setAgregado(false);
              }}
              aria-label={`Ir a ${p.nombre}`}
              className={`h-1.5 w-1.5 rounded-full transition ${
                i === indice % total ? "bg-brand" : "bg-brand/30"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
