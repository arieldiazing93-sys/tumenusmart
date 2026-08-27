"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { eliminarHorario } from "../actions";

export function EliminarHorarioBoton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function eliminar() {
    if (!confirm("¿Quitar este horario? Ya no va a aparecer para nuevas reservas.")) return;
    startTransition(async () => {
      await eliminarHorario(id);
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={eliminar}
      disabled={pending}
      className="text-tinta-suave hover:text-peligro disabled:opacity-50"
    >
      ✕
    </button>
  );
}
