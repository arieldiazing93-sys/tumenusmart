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
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-linea bg-papel/96 px-4 pb-5 pt-3 backdrop-blur">
      {/*
        Un botón centrado, no una barra de lado a lado.

        Antes ocupaba todo el ancho con el texto a un extremo y el total al
        otro, y en el celular esos dos datos quedaban tan separados que había
        que mirar dos veces para juntarlos. Como pastilla centrada se lee de
        una: qué es, cuánto llevás y cuánto sale, en ese orden.
      */}
      <Link
        href={`/${slug}/carrito`}
        className={`mx-auto flex w-fit max-w-full items-center justify-center gap-2.5 rounded-full bg-brand px-6 py-3 text-white transition-transform active:scale-[0.98] ${
          saltando ? "animate-[saltito_0.42s_ease]" : ""
        }`}
      >
        <span className="text-[0.92rem] font-semibold">Ver mi pedido</span>
        <span aria-hidden="true" className="text-white/45">·</span>
        <span className="whitespace-nowrap text-[0.82rem] font-medium text-white/85">
          {cantidadTotal} {cantidadTotal === 1 ? "ítem" : "ítems"}
        </span>
        <span aria-hidden="true" className="text-white/45">·</span>
        <span className="cifra whitespace-nowrap text-[0.92rem] font-semibold">
          {formatearGuarani(subtotal)}
        </span>
      </Link>
    </div>
  );
}
