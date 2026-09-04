"use client";

import { useTransition } from "react";
import { asignarRepartidor } from "./actions";

type Repartidor = { id: string; nombre: string };

export function RepartidorSelect({
  orderId,
  repartidorIdActual,
  repartidores,
}: {
  orderId: string;
  repartidorIdActual: string | null;
  repartidores: Repartidor[];
}) {
  const [pending, startTransition] = useTransition();

  return (
    <select
      value={repartidorIdActual ?? ""}
      disabled={pending}
      onChange={(e) => {
        const repartidorId = e.target.value;
        startTransition(() => {
          asignarRepartidor(orderId, repartidorId);
        });
      }}
      className="rounded-lg border border-linea px-2 py-1.5 text-sm disabled:opacity-50"
    >
      <option value="">Sin asignar</option>
      {repartidores.map((r) => (
        <option key={r.id} value={r.id}>
          {r.nombre}
        </option>
      ))}
    </select>
  );
}
