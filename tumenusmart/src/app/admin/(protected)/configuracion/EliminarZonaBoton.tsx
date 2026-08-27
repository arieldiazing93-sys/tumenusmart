"use client";

import { useState, useTransition } from "react";
import { eliminarZona, alternarActivaZona } from "./actions";

export function EliminarZonaBoton({ id, activo }: { id: string; activo: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function borrar() {
    setError(null);
    if (!confirm("¿Borrar esta zona? No se puede deshacer.")) return;
    startTransition(async () => {
      try {
        await eliminarZona(id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo borrar.");
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(() => alternarActivaZona(id, !activo))}
          className="text-sm text-tinta-media hover:underline disabled:opacity-50"
        >
          {activo ? "Desactivar" : "Activar"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={borrar}
          className="text-sm text-peligro hover:underline disabled:opacity-50"
        >
          Borrar
        </button>
      </div>
      {error && <p className="max-w-xs text-right text-xs text-peligro">{error}</p>}
    </div>
  );
}
