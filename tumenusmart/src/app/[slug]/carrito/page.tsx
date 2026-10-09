"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useCart } from "@/components/CartProvider";
import { VolverAlMenu } from "@/components/Volver";
import {
  precioUnitario,
  opcionesTexto,
  ingredientesQuitadosTexto,
  type ItemCarrito,
} from "@/lib/cart-types";
import { formatearGuarani } from "@/lib/format";

/**
 * Una línea del carrito, como tarjeta.
 *
 * "Quitar" no borra al toque: espera a que la fila se achique y se apague
 * antes de sacarla de la lista, así el cliente ve que fue justo ESE ítem el
 * que se fue y no un salto brusco en la lista. El +/- da un destello corto
 * por la misma razón que el resto de la app confirma cada toque: sin eso, es
 * fácil tocar dos veces por las dudas y terminar con más de lo que se quería.
 */
function FilaCarrito({
  item,
  onQuitar,
}: {
  item: ItemCarrito;
  onQuitar: () => void;
}) {
  const { actualizarCantidad } = useCart();
  const [saliendo, setSaliendo] = useState(false);
  const [destellando, setDestellando] = useState(false);
  const cantidadAnterior = useRef(item.cantidad);

  useEffect(() => {
    if (item.cantidad !== cantidadAnterior.current) {
      cantidadAnterior.current = item.cantidad;
      setDestellando(true);
      const t = window.setTimeout(() => setDestellando(false), 500);
      return () => window.clearTimeout(t);
    }
  }, [item.cantidad]);

  function quitar() {
    setSaliendo(true);
    window.setTimeout(onQuitar, 200);
  }

  return (
    <div
      className={`grid transition-[grid-template-rows,opacity] duration-200 ${
        saliendo ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"
      }`}
    >
      <div className="overflow-hidden pb-3">
        <div
          className={`flex items-start gap-3 rounded-2xl bg-superficie p-3.5 shadow-sm ring-1 ring-linea ${
            destellando ? "animate-[destello_0.5s_ease]" : ""
          }`}
        >
          {item.imagenUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.imagenUrl} alt="" loading="lazy" className="h-20 w-20 flex-none rounded-xl object-cover" />
          )}

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <p className="text-[1rem] font-semibold leading-tight tracking-titular text-tinta">{item.nombreProducto}</p>
              <span className="cifra flex-none text-[1.05rem] font-bold text-tinta">
                {formatearGuarani(precioUnitario(item) * item.cantidad)}
              </span>
            </div>
            {item.opciones.length > 0 && (
              <p className="mt-0.5 text-[0.82rem] leading-snug text-tinta-suave">{opcionesTexto(item)}</p>
            )}
            {ingredientesQuitadosTexto(item) && (
              <p className="mt-0.5 text-[0.82rem] leading-snug text-peligro">{ingredientesQuitadosTexto(item)}</p>
            )}
            <p className="cifra mt-1 text-[0.82rem] text-tinta-media">{formatearGuarani(precioUnitario(item))} c/u</p>

            <div className="mt-2.5 flex items-center justify-between gap-2">
              {/* Contador redondo: − · cantidad · + */}
              <div className="flex items-center rounded-full bg-papel-hundido p-1">
                <button
                  type="button"
                  aria-label="Uno menos"
                  className="flex h-9 w-9 items-center justify-center rounded-full text-[1.25rem] text-tinta transition-colors hover:bg-superficie"
                  onClick={() => actualizarCantidad(item.key, item.cantidad - 1)}
                >
                  −
                </button>
                <span className="cifra min-w-7 text-center text-[1rem] font-bold text-tinta">{item.cantidad}</span>
                <button
                  type="button"
                  aria-label="Uno más"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-brand text-[1.25rem] text-white transition-colors hover:bg-brand-dark"
                  onClick={() => actualizarCantidad(item.key, item.cantidad + 1)}
                >
                  +
                </button>
              </div>

              <button
              type="button"
              onClick={quitar}
              // Azul y no rojo: sacar un ítem del propio carrito se deshace
              // volviéndolo a agregar. El rojo es para lo que no tiene vuelta,
              // y usarlo acá lo gastaría para cuando de verdad haga falta.
              className="inline-flex items-center rounded-full border border-azul/35 bg-azul-luz px-3.5 py-1.5 text-[0.8rem] font-semibold text-azul-oscuro transition-colors hover:border-azul hover:bg-azul hover:text-white"
            >
              Quitar
            </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * "Ver mi pedido" — el repaso antes de mandar.
 *
 * La salida hacia la carta va al final de la lista y como botón. Antes era
 * texto gris al costado: el que entraba acá para chequear qué llevaba no
 * encontraba cómo seguir agregando, y la única salida evidente era vaciar el
 * carrito.
 */
export default function CarritoPage() {
  const { items, quitarItem, subtotal } = useCart();
  const { slug } = useParams<{ slug: string }>();

  const cantidadTotal = items.reduce((s, i) => s + i.cantidad, 0);

  if (items.length === 0) {
    return (
      <main className="mx-auto flex max-w-2xl flex-col items-center px-4 py-20 text-center">
        <span
          aria-hidden="true"
          className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-light text-brand-texto ring-8 ring-brand-light/50"
        >
          <svg viewBox="0 0 24 24" width={34} height={34} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <path d="M2.5 3h2.4l2.2 11.4a2 2 0 0 0 2 1.6h7.9a2 2 0 0 0 1.96-1.6L20.5 7H6" />
            <circle cx="9" cy="20" r="1.4" fill="currentColor" stroke="none" />
            <circle cx="18" cy="20" r="1.4" fill="currentColor" stroke="none" />
          </svg>
        </span>
        <h1 className="mt-5 text-[1.35rem] font-semibold tracking-titular text-tinta">Tu pedido está vacío</h1>
        <p className="mt-1.5 mb-6 text-[0.95rem] text-tinta-suave">Todavía no agregaste nada a tu pedido.</p>
        <VolverAlMenu slug={slug} texto="Ver la carta" className="!h-12 !rounded-2xl px-6" />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 pb-40 pt-4">
      <header className="mb-5 flex items-center gap-3">
        <Link
          href={`/${slug}`}
          aria-label="Volver a la carta"
          className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-azul-luz text-[1.25rem] leading-none text-azul-oscuro transition-all hover:bg-azul hover:text-white active:scale-90"
        >
          ←
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-[1.6rem] font-semibold leading-tight tracking-titular text-tinta">Tu pedido</h1>
        </div>
        <span className="rounded-full bg-brand-light px-3 py-1 text-[0.8rem] font-semibold text-brand-texto">
          {cantidadTotal} {cantidadTotal === 1 ? "ítem" : "ítems"}
        </span>
      </header>

      <div className="flex flex-col">
        {items.map((item) => (
          <FilaCarrito key={item.key} item={item} onQuitar={() => quitarItem(item.key)} />
        ))}
      </div>

      {/*
        "Seguir agregando" va DESPUÉS de la lista, no antes.
        Arriba competía con el título y ensuciaba lo primero que se ve; acá
        aparece justo cuando el cliente terminó de repasar lo que lleva, que es
        el momento en que se pregunta si le falta algo. Ancho completo porque
        en el celular es donde llega el pulgar.
      */}
      <div className="mt-4">
        <VolverAlMenu slug={slug} texto="Seguir agregando" className="w-full justify-center !h-12 !rounded-2xl" />
      </div>

      {/* Abajo, siempre a la vista: el total y el botón para seguir, sobre una base sólida con un difuminado arriba. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20">
        <div aria-hidden="true" className="mx-auto h-8 max-w-2xl bg-gradient-to-t from-papel-suave to-transparent" />
        <div
          className="pointer-events-auto mx-auto max-w-2xl bg-papel-suave px-4 pt-1"
          style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom, 0px))" }}
        >
          <div className="mb-2.5 flex items-baseline justify-between px-1">
            <span className="text-[0.82rem] font-semibold uppercase tracking-rotulo text-tinta-suave">Subtotal</span>
            <span className="cifra text-[1.35rem] font-bold text-tinta">{formatearGuarani(subtotal)}</span>
          </div>
          <Link
            href={`/${slug}/checkout`}
            className="flex h-14 w-full items-center justify-center rounded-2xl bg-brand text-[1rem] font-semibold text-white shadow-alta transition-all hover:bg-brand-dark active:scale-[0.98]"
          >
            Continuar
          </Link>
        </div>
      </div>
    </main>
  );
}
