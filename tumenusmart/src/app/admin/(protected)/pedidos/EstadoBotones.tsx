"use client";

import { useState, useTransition } from "react";
import { cambiarEstadoPedido } from "./actions";
import { ESTADOS_PEDIDO } from "@/lib/estados-pedido";

export function EstadoBotones({
  orderId,
  estadoActual,
  tipoEntrega,
  repartidorId,
}: {
  orderId: string;
  estadoActual: string;
  tipoEntrega: string;
  repartidorId: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const faltaRepartidor = tipoEntrega === "delivery" && !repartidorId;

  function handleClick(estado: string) {
    setError(null);
    if (estado === "en_despacho" && faltaRepartidor) {
      setError("Asigná un repartidor antes de pasar el pedido a \"En despacho\".");
      return;
    }
    startTransition(async () => {
      try {
        await cambiarEstadoPedido(orderId, estado);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo cambiar el estado");
      }
    });
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {ESTADOS_PEDIDO.map((e) => {
          const activo = estadoActual === e.value;
          const bloqueado = e.value === "en_despacho" && faltaRepartidor;
          return (
            <button
              key={e.value}
              type="button"
              disabled={pending}
              title={bloqueado ? "Asigná un repartidor primero" : undefined}
              onClick={() => handleClick(e.value)}
              className={`rounded-full border px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${
                activo
                  ? "border-brand bg-brand text-white"
                  : bloqueado
                    ? "border-linea text-tinta-suave"
                    : "border-linea text-tinta-media hover:border-brand hover:text-brand"
              }`}
            >
              {e.emoji} {e.label}
            </button>
          );
        })}
      </div>
      {error && <p className="mt-2 text-sm text-peligro">{error}</p>}
      {faltaRepartidor && !error && (
        <p className="mt-2 text-xs text-tinta-suave">
          Este pedido es delivery y todavía no tiene repartidor asignado.
        </p>
      )}
    </div>
  );
}
