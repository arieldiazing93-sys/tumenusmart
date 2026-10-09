"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useCart } from "./CartProvider";
import { formatearGuarani } from "@/lib/format";

/**
 * La barra del carrito, siempre a la vista con el total.
 *
 * Da un saltito cada vez que el total cambia. No es adorno: es el acuse de
 * recibo de que lo que tocó el cliente entró. Sin esa confirmación, la gente
 * toca dos veces y termina con el doble de lo que quería.
 *
 * Es un botón grande y flotante: a la izquierda cuántos ítems lleva, en el medio qué hace y a la derecha cuánto sale. Detrás
 * tiene una base sólida (con un difuminado arriba) para que la carta no se transparente por debajo del texto.
 */
export function CartBar() {
  const { cantidadTotal, subtotal } = useCart();
  const { slug } = useParams<{ slug: string }>();
  const [saltando, setSaltando] = useState(false);
  const anterior = useRef(cantidadTotal);

  useEffect(() => {
    if (cantidadTotal !== anterior.current && cantidadTotal > 0) {
      setSaltando(true);
      const t = window.setTimeout(() => setSaltando(false), 420);
      anterior.current = cantidadTotal;
      return () => window.clearTimeout(t);
    }
    anterior.current = cantidadTotal;
  }, [cantidadTotal]);

  if (cantidadTotal === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30">
      <div aria-hidden="true" className="mx-auto h-8 max-w-2xl bg-gradient-to-t from-papel-suave to-transparent" />
      <div
        className="pointer-events-auto mx-auto max-w-2xl bg-papel-suave px-4 pt-1"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom, 0px))" }}
      >
        <Link
          href={`/${slug}/carrito`}
          className={`flex h-14 w-full items-center gap-3 rounded-2xl bg-brand px-4 text-white shadow-alta transition-transform active:scale-[0.98] ${
            saltando ? "animate-[saltito_0.42s_ease]" : ""
          }`}
        >
          <span className="flex h-8 min-w-8 items-center justify-center rounded-full bg-white/20 px-2 text-[0.9rem] font-bold">
            {cantidadTotal}
          </span>
          <span className="flex-1 text-left text-[0.98rem] font-semibold">Ver mi pedido</span>
          <span className="cifra whitespace-nowrap text-[1.05rem] font-bold">{formatearGuarani(subtotal)}</span>
        </Link>
      </div>
    </div>
  );
}
