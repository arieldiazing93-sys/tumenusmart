"use client";

import { useTransition } from "react";
import { cambiarEstadoPedido } from "./actions";

const ESTADOS = [
  { value: "pendiente", label: "Pendiente" },
  { value: "confirmado", label: "Confirmado" },
  { value: "en_preparacion", label: "En preparación" },
  { value: "listo", label: "Listo" },
  { value: "entregado", label: "Entregado" },
  { value: "cancelado", label: "Cancelado" },
];

export function EstadoSelect({
  orderId,
  estadoActual,
}: {
  orderId: string;
  estadoActual: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <select
      value={estadoActual}
      disabled={pending}
      onChange={(e) =>
        startTransition(() => {
          cambiarEstadoPedido(orderId, e.target.value);
        })
      }
      className="rounded-lg border border-neutral-300 px-2 py-1 text-sm disabled:opacity-50"
    >
      {ESTADOS.map((e) => (
        <option key={e.value} value={e.value}>
          {e.label}
        </option>
      ))}
    </select>
  );
}
