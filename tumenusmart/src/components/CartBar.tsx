"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCart } from "./CartProvider";
import { formatearGuarani } from "@/lib/format";

export function CartBar() {
  const { cantidadTotal, subtotal } = useCart();
  // El local sale de la propia URL, así no hay que pasarlo por props hasta acá.
  const { slug } = useParams<{ slug: string }>();

  if (cantidadTotal === 0) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-10 border-t border-neutral-200 bg-white p-4 shadow-lg">
      <Link
        href={`/${slug}/carrito`}
        className="mx-auto flex max-w-md items-center justify-between rounded-xl bg-brand px-4 py-3 text-white"
      >
        <span className="font-medium">
          {cantidadTotal} {cantidadTotal === 1 ? "producto" : "productos"}
        </span>
        <span className="font-semibold">Ver carrito · {formatearGuarani(subtotal)}</span>
      </Link>
    </div>
  );
}
