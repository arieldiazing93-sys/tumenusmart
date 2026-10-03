"use client";

import { useTransition } from "react";
import { asignarRepartidor } from "./actions";

type Repartidor = { id: string; nombre: string };

/**
 * Elegir el repartidor de un delivery. Va en el amarillo natural de los campos de "a quién se le asigna" (igual que
 * Personal en el POS y la agenda): es lo que falta para poder despachar, y en amarillo se ve de un vistazo en vez de
 * mezclarse con el resto de la pantalla.
 */
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
      aria-label="Repartidor"
      className="rounded-lg border-2 border-amarillo bg-amarillo-campo px-3 py-2 text-[0.88rem] font-semibold text-tinta focus:outline-none focus:ring-2 focus:ring-amarillo/40 disabled:opacity-50"
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
