"use client";

import { useState, useTransition } from "react";
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
  const [todoElDia, setTodoElDia] = useState(false);

  function alAgregar(formData: FormData) {
    if (todoElDia) {
      formData.set("abre", "00:00");
      formData.set("cierra", "23:59");
    }
    iniciar(async () => {
      const resultado = await agregarTramoCategoria(categoryId, formData);
      if (!resultado.ok) alert(resultado.error);
    });
  }

  return (
    <form action={alAgregar} className="flex w-full flex-none flex-col gap-1.5 sm:w-64">
      <input type="hidden" name="diaSemana" value={dia} />
      <label className="flex items-center gap-1.5 text-xs text-tinta-media">
        <input
          type="checkbox"
          checked={todoElDia}
          onChange={(e) => setTodoElDia(e.target.checked)}
        />
        Bloquear el {diaLabel} entero
      </label>
      <div className="flex items-center gap-1.5">
        {!todoElDia && (
          <>
            <input
              type="time"
              name="abre"
              required
              aria-label={`Desde qué hora se oculta el ${diaLabel}`}
              className="w-full rounded-lg border border-linea px-2 py-1.5 text-sm"
            />
            <span className="text-tinta-suave">–</span>
            <input
              type="time"
              name="cierra"
              required
              aria-label={`Hasta qué hora se oculta el ${diaLabel}`}
              className="w-full rounded-lg border border-linea px-2 py-1.5 text-sm"
            />
          </>
        )}
        <button
          type="submit"
          disabled={pendiente}
          aria-label={`Agregar bloqueo al ${diaLabel}`}
          className="flex-none rounded-lg bg-noche-panel px-2.5 py-1.5 text-sm font-semibold text-white hover:bg-noche-panel disabled:opacity-50"
        >
          {todoElDia ? "Bloquear día" : "+"}
        </button>
      </div>
    </form>
  );
}
