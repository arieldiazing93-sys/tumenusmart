"use client";

import { useTransition } from "react";
import { eliminarZona } from "./actions";

export function EliminarZonaBoton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => eliminarZona(id))}
      className="text-sm text-red-500 hover:underline disabled:opacity-50"
    >
      Borrar
    </button>
  );
}
