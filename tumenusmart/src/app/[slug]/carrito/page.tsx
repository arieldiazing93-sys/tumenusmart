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
 * Una línea del carrito.
 *
 * "Quitar" no borra al toque: espera a que la fila se achique y se apague
 * antes de sacarla de la lista, así el cliente ve que fue justo ESE ítem el
 * que se fue y no un salto brusco en la lista. El +/- da un destello corto
 * por la misma razón que el resto de la app confirma cada toque: sin eso, es
 * fácil tocar dos veces por las dudas y terminar con más de lo que se quería.
 */
function FilaCarrito({
  item,
  esUltimo,
  onQuitar,
}: {
  item: ItemCarrito;
  esUltimo: boolean;
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
      <div className="overflow-hidden">
        <div
          className={`flex items-start justify-between gap-3 py-4 ${
            esUltimo ? "" : "border-b border-linea-fina"
          } ${destellando ? "animate-[destello_0.5s_ease]" : ""}`}
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
              onClick={quitar}
              // Azul y no rojo: sacar un ítem del propio carrito se deshace
              // volviéndolo a agregar. El rojo es para lo que no tiene vuelta,
              // y usarlo acá lo gastaría para cuando de verdad haga falta.
              className="mt-2 inline-flex items-center rounded-lg border border-azul/35 bg-azul-luz px-2.5 py-1 text-[0.76rem] font-semibold text-azul-oscuro transition-colors hover:border-azul hover:bg-azul hover:text-white"
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
      <div className="mb-5 flex items-baseline justify-between gap-3">
        <h1 className="text-[1.35rem] font-semibold tracking-titular">Tu pedido</h1>
        <span className="text-[0.8rem] text-tinta-suave">
          {cantidadTotal} {cantidadTotal === 1 ? "ítem" : "ítems"}
        </span>
      </div>

      <div className="flex flex-col">
        {items.map((item, i) => (
          <FilaCarrito
            key={item.key}
            item={item}
            esUltimo={i === items.length - 1}
            onQuitar={() => quitarItem(item.key)}
          />
        ))}
      </div>

      {/*
        "Seguir agregando" va DESPUÉS de la lista, no antes.
        Arriba competía con el título y ensuciaba lo primero que se ve; acá
        aparece justo cuando el cliente terminó de repasar lo que lleva, que es
        el momento en que se pregunta si le falta algo. Ancho completo porque
        en el celular es donde llega el pulgar.
      */}
      <div className="mt-7">
        <VolverAlMenu
          slug={slug}
          texto="Seguir agregando"
          className="w-full justify-center py-3"
        />
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-linea bg-papel/95 p-4 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <span>
            <span className="block text-[0.72rem] uppercase tracking-rotulo text-tinta-suave">
              Total
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
