"use client";

import { useTransition } from "react";
import { eliminarCategoria } from "./actions";

export function EliminarCategoriaBoton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm("¿Borrar esta categoría?")) return;
        startTransition(async () => {
          try {
            await eliminarCategoria(id);
          } catch (err) {
            alert(err instanceof Error ? err.message : "No se pudo borrar");
          }
        });
      }}
      className="text-sm text-red-500 hover:underline disabled:opacity-50"
    >
      Borrar
    </button>
  );
}
