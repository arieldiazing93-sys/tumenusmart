"use client";

import { useTransition } from "react";
import { agregarTramoCategoria } from "../actions";

export function AgregarTramoCategoriaForm({
  categoryId,
  dia,
  diaLabel,
}: {
  categoryId: string;
  dia: number;
  diaLabel: string;
}) {
  const [pendiente, iniciar] = useTransition();

  function alAgregar(formData: FormData) {
    iniciar(async () => {
      const resultado = await agregarTramoCategoria(categoryId, formData);
      if (!resultado.ok) alert(resultado.error);
    });
  }

  return (
    <form action={alAgregar} className="flex w-full flex-none items-center gap-1.5 sm:w-64">
      <input type="hidden" name="diaSemana" value={dia} />
      <input
        type="time"
        name="abre"
        required
        aria-label={`Hora de apertura del ${diaLabel} para esta categoría`}
        className="w-full rounded-lg border border-linea px-2 py-1.5 text-sm"
      />
      <span className="text-tinta-suave">–</span>
      <input
        type="time"
        name="cierra"
        required
        aria-label={`Hora de cierre del ${diaLabel} para esta categoría`}
        className="w-full rounded-lg border border-linea px-2 py-1.5 text-sm"
      />
      <button
        type="submit"
        disabled={pendiente}
        aria-label={`Agregar tramo al ${diaLabel}`}
        className="flex-none rounded-lg bg-noche-panel px-2.5 py-1.5 text-sm font-semibold text-white hover:bg-noche-panel disabled:opacity-50"
      >
        +
      </button>
    </form>
  );
}
