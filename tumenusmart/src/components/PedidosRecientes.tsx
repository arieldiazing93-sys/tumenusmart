"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatearNumero } from "@/lib/format";
import { guardarPedidoReciente, leerPedidosRecientes, type PedidoReciente } from "@/lib/pedidos-recientes";

/**
 * «Ver mi pedido»: los pedidos que este navegador envió hace poco, para volver a su seguimiento si el cliente retrocedió o cerró la
 * pestaña. No muestra nada si no hay (o si el navegador no guarda). Se lee recién en el navegador: el servidor no sabe de ellos.
 */
export function PedidosRecientes({ slug, className = "" }: { slug: string; className?: string }) {
  const [pedidos, setPedidos] = useState<PedidoReciente[]>([]);

  useEffect(() => {
    setPedidos(leerPedidosRecientes(slug));
  }, [slug]);

  if (pedidos.length === 0) return null;

  return (
    <section aria-label="Tus pedidos" className={`rounded-2xl bg-brand-light/60 p-3.5 ring-1 ring-brand/15 ${className}`}>
      <p className="text-[0.72rem] font-semibold uppercase tracking-rotulo text-brand-texto">Tus pedidos</p>
      <ul className="mt-2 flex flex-col gap-1.5">
        {pedidos.map((p) => (
          <li key={p.token}>
            <Link
              href={`/${slug}/pedido/${p.token}`}
              className="flex h-11 items-center justify-between gap-3 rounded-xl bg-superficie px-3.5 text-[0.92rem] font-semibold text-tinta shadow-sm ring-1 ring-linea transition-all hover:ring-brand active:scale-[0.98]"
            >
              <span>Pedido {formatearNumero(p.numero)}</span>
              <span className="text-brand-texto">Ver mi pedido →</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Anota este pedido entre los recientes del navegador. Va en la pantalla de seguimiento: así, aunque el cliente haya llegado por el
 * enlace del WhatsApp (o desde otro celular), después puede volver a su pedido desde el menú.
 */
export function RecordarPedido({ slug, token, numero }: { slug: string; token: string; numero: number }) {
  useEffect(() => {
    guardarPedidoReciente(slug, { token, numero });
  }, [slug, token, numero]);
  return null;
}
