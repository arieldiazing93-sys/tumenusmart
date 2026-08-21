"use client";

import { useTransition } from "react";
import { alternarActivoRepartidor, eliminarRepartidor } from "./actions";

export function RepartidorAcciones({ id, activo }: { id: string; activo: boolean }) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-3 text-sm">
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(() => alternarActivoRepartidor(id, !activo))}
        className={`rounded-full px-2.5 py-0.5 text-xs font-medium disabled:opacity-50 ${
          activo ? "bg-green-100 text-green-700" : "bg-neutral-100 text-neutral-500"
        }`}
      >
        {activo ? "Activo" : "Inactivo"}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!confirm("¿Borrar este repartidor?")) return;
          startTransition(async () => {
            try {
              await eliminarRepartidor(id);
            } catch (err) {
              alert(err instanceof Error ? err.message : "No se pudo borrar");
            }
          });
        }}
        className="text-red-500 hover:underline disabled:opacity-50"
      >
        Borrar
      </button>
    </div>
  );
}
