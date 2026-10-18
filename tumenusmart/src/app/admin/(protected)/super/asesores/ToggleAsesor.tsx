"use client";

import { useState, useTransition } from "react";
import { llamarAlServidor } from "@/lib/llamar-servidor";
import { alternarActivoAsesor } from "../actions";

export function ToggleAsesor({ id, activo }: { id: string; activo: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function alternar() {
    setError(null);
    startTransition(async () => {
      const r = await llamarAlServidor(async () => {
        await alternarActivoAsesor(id, !activo);
        return { ok: true as const };
      });
      if (!r.ok) setError(r.error);
    });
  }

  return (
    <span className="inline-flex flex-col items-start">
      <button
        type="button"
        disabled={pending}
        onClick={alternar}
        className="text-sm text-tinta-media hover:underline disabled:opacity-50"
      >
        {activo ? "Desactivar" : "Activar"}
      </button>
      {error && (
        <span role="alert" className="text-xs text-peligro">
          {error}
        </span>
      )}
    </span>
  );
}
