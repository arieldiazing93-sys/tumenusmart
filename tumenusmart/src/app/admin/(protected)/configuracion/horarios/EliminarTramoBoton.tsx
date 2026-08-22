"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { eliminarTramoHorario } from "../actions";

export function EliminarTramoBoton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function eliminar() {
    if (!confirm("¿Quitar este tramo de horario?")) return;
    startTransition(async () => {
      await eliminarTramoHorario(id);
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={eliminar}
      disabled={pending}
      className="text-neutral-400 hover:text-red-600 disabled:opacity-50"
      aria-label="Quitar tramo"
    >
      ✕
    </button>
  );
}
