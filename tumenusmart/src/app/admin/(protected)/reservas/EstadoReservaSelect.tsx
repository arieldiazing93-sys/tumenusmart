"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { actualizarEstadoReserva } from "./actions";
import { ESTADOS_RESERVA, colorEstadoReserva } from "@/lib/reservas";

export function EstadoReservaSelect({ id, estado }: { id: string; estado: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function cambiar(nuevoEstado: string) {
    startTransition(async () => {
      await actualizarEstadoReserva(id, nuevoEstado);
      router.refresh();
    });
  }

  return (
    <select
      value={estado}
      disabled={pending}
      onChange={(e) => cambiar(e.target.value)}
      className={`rounded-full border-0 px-2.5 py-1 text-xs font-medium ${colorEstadoReserva(estado)}`}
    >
      {ESTADOS_RESERVA.map((e) => (
        <option key={e.value} value={e.value}>
          {e.emoji} {e.label}
        </option>
      ))}
    </select>
  );
}
