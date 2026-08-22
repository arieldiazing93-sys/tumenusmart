"use client";

import { useState, useTransition } from "react";
import { marcarPedidoEntregado } from "./actions";

export function EntregarBoton({
  repartidorId,
  orderId,
}: {
  repartidorId: string;
  orderId: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState(false);

  function marcar() {
    setError(null);
    if (!confirm("¿Confirmás que entregaste este pedido?")) return;
    startTransition(async () => {
      try {
        await marcarPedidoEntregado(repartidorId, orderId);
        setHecho(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo marcar como entregado");
      }
    });
  }

  if (hecho) {
    return <span className="text-sm font-semibold text-green-600">✓ Entregado</span>;
  }

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={marcar}
        className="w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
      >
        {pending ? "Marcando..." : "✓ Marcar como entregado"}
      </button>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
