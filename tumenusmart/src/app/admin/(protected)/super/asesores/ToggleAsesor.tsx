"use client";

import { useTransition } from "react";
import { alternarActivoAsesor } from "../actions";

export function ToggleAsesor({ id, activo }: { id: string; activo: boolean }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => alternarActivoAsesor(id, !activo))}
      className="text-sm text-tinta-media hover:underline disabled:opacity-50"
    >
      {activo ? "Desactivar" : "Activar"}
    </button>
  );
}
