"use client";

import { useTransition } from "react";
import { cambiarEstadoPedido } from "./actions";
import { ESTADOS_PEDIDO } from "@/lib/estados-pedido";

export function EstadoBotones({
  orderId,
  estadoActual,
}: {
  orderId: string;
  estadoActual: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-wrap gap-2">
      {ESTADOS_PEDIDO.map((e) => {
        const activo = estadoActual === e.value;
        return (
          <button
            key={e.value}
            type="button"
            disabled={pending}
            onClick={() => startTransition(() => cambiarEstadoPedido(orderId, e.value))}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${
              activo
                ? "border-brand bg-brand text-white"
                : "border-neutral-300 text-neutral-600 hover:border-brand hover:text-brand"
            }`}
          >
            {e.emoji} {e.label}
          </button>
        );
      })}
    </div>
  );
}
