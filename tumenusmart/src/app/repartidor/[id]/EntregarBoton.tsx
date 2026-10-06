"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { marcarPedidoEntregado } from "./actions";

/**
 * Marcar entregado. Es solo la ruta del repartidor: el pedido ya llegó cobrado y facturado desde la caja, así que acá no se
 * pregunta con qué pagó el cliente (lo que se cobró y cómo ya quedó cargado). Un solo toque para confirmar.
 */
export function EntregarBoton({ repartidorId, orderId }: { repartidorId: string; orderId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState(false);

  function marcar() {
    setError(null);
    startTransition(async () => {
      const resultado = await marcarPedidoEntregado(repartidorId, orderId);
      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }
      setHecho(true);
      router.refresh();
    });
  }

  if (hecho) {
    return <span className="text-sm font-semibold text-exito">✓ Entregado</span>;
  }

  return (
    <div>
      {/* Botón grande: esto se aprieta parado en la vereda, de noche y con una mano ocupada. */}
      <button
        type="button"
        disabled={pending}
        onClick={marcar}
        className="w-full rounded-lg bg-brand px-4 py-3 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
      >
        {pending ? "Marcando…" : "✓ Marcar como entregado"}
      </button>
      {error && <p className="mt-1 text-xs text-peligro">{error}</p>}
    </div>
  );
}
