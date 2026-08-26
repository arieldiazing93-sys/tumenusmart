"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCart } from "@/components/CartProvider";
import { VolverAlMenu } from "@/components/Volver";
import { precioUnitario, opcionesTexto, ingredientesQuitadosTexto } from "@/lib/cart-types";
import { formatearGuarani } from "@/lib/format";

/**
 * "Ver mi pedido" — el repaso antes de mandar.
 *
 * La salida hacia la carta va ARRIBA y como botón. Antes era texto gris al
 * costado: el que entraba acá para chequear qué llevaba no encontraba cómo
 * seguir agregando, y la única salida evidente era vaciar el carrito.
 */
export default function CarritoPage() {
  const { items, actualizarCantidad, quitarItem, subtotal } = useCart();
  const { slug } = useParams<{ slug: string }>();

  const cantidadTotal = items.reduce((s, i) => s + i.cantidad, 0);

  if (items.length === 0) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="mb-5 text-[0.95rem] text-tinta-suave">
          Todavía no agregaste nada a tu pedido.
        </p>
        <VolverAlMenu slug={slug} texto="Ver la carta" />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 pb-32 pt-6">
      <VolverAlMenu slug={slug} texto="Seguir agregando" />

      <div className="mb-5 mt-5 flex items-baseline justify-between gap-3">
        <h1 className="text-[1.35rem] font-semibold tracking-titular">Tu pedido</h1>
        <span className="text-[0.8rem] text-tinta-suave">
          {cantidadTotal} {cantidadTotal === 1 ? "ítem" : "ítems"}
        </span>
      </div>

      <div className="flex flex-col">
        {items.map((item) => (
          <div
            key={item.key}
            className="flex items-start justify-between gap-3 border-b border-linea-fina py-4 last:border-0"
          >
            <div className="min-w-0 flex-1">
              <p className="text-[0.92rem] font-semibold leading-tight tracking-titular">
                {item.nombreProducto}
              </p>
              {item.opciones.length > 0 && (
                <p className="mt-0.5 text-[0.78rem] leading-snug text-tinta-suave">
                  {opcionesTexto(item)}
                </p>
              )}
              {ingredientesQuitadosTexto(item) && (
                <p className="mt-0.5 text-[0.78rem] leading-snug text-peligro">
                  {ingredientesQuitadosTexto(item)}
                </p>
              )}
              <p className="cifra mt-1 text-[0.8rem] text-tinta-media">
                {formatearGuarani(precioUnitario(item))} c/u
              </p>

              <button
                type="button"
                onClick={() => quitarItem(item.key)}
                className="mt-1.5 text-[0.76rem] text-tinta-suave underline underline-offset-2 hover:text-peligro"
              >
                Quitar
              </button>
            </div>

            <div className="flex flex-none flex-col items-end gap-2">
              <span className="cifra text-[0.92rem] font-semibold">
                {formatearGuarani(precioUnitario(item) * item.cantidad)}
              </span>
              <div className="flex items-center rounded-lg border border-linea bg-white">
                <button
                  type="button"
                  aria-label="Uno menos"
                  className="px-2.5 py-1 text-tinta-media"
                  onClick={() => actualizarCantidad(item.key, item.cantidad - 1)}
                >
                  −
                </button>
                <span className="cifra w-6 text-center text-[0.85rem]">{item.cantidad}</span>
                <button
                  type="button"
                  aria-label="Uno más"
                  className="px-2.5 py-1 text-tinta-media"
                  onClick={() => actualizarCantidad(item.key, item.cantidad + 1)}
                >
                  +
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-linea bg-papel/95 p-4 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <span>
            <span className="block text-[0.72rem] uppercase tracking-rotulo text-tinta-suave">
              Subtotal
            </span>
            <span className="cifra text-[1.15rem] font-semibold">
              {formatearGuarani(subtotal)}
            </span>
          </span>
          <Link
            href={`/${slug}/checkout`}
            className="rounded-lg bg-brand px-6 py-3 text-[0.92rem] font-semibold text-white transition-colors hover:bg-brand-dark"
          >
            Continuar
          </Link>
        </div>
      </div>
    </main>
  );
}
