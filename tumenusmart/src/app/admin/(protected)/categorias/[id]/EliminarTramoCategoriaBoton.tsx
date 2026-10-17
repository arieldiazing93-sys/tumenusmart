"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { llamarAlServidor } from "@/lib/llamar-servidor";
import { eliminarTramoCategoria } from "../actions";

export function EliminarTramoCategoriaBoton({
  categoryId,
  id,
}: {
  categoryId: string;
  id: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function eliminar() {
    if (!confirm("¿Quitar este tramo de horario?")) return;
    startTransition(async () => {
      const r = await llamarAlServidor(async () => {
        await eliminarTramoCategoria(categoryId, id);
        return { ok: true as const };
      });
      if (!r.ok) {
        alert(r.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={eliminar}
      disabled={pending}
      className="text-tinta-suave hover:text-peligro disabled:opacity-50"
      aria-label="Quitar tramo"
    >
      ✕
    </button>
  );
}
