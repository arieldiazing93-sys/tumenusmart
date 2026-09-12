"use client";

import { useState, useTransition } from "react";
import { actualizarCostoOpcion } from "../actions";

/**
 * Cargar o corregir el costo de un agregado ya existente, sin tener que
 * borrarlo y crearlo de nuevo (que además hacía perder el precio extra ya
 * configurado).
 */
export function EditarCostoOpcion({
  productId,
  optionId,
  costoActual,
}: {
  productId: string;
  optionId: string;
  costoActual: number | null;
}) {
  const [pendiente, iniciar] = useTransition();
  const [valor, setValor] = useState(costoActual != null ? String(costoActual) : "");

  function guardar() {
    iniciar(async () => {
      const datos = new FormData();
      datos.set("costo", valor);
      const resultado = await actualizarCostoOpcion(productId, optionId, datos);
      if (!resultado.ok) alert(resultado.error);
    });
  }

  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-tinta-suave">Costo</span>
      <input
        type="number"
        min="0"
        step="1"
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        placeholder="Gs."
        className="w-20 rounded border border-linea px-1.5 py-0.5 text-xs"
      />
      <button
        type="button"
        onClick={guardar}
        disabled={pendiente}
        className="rounded bg-brand px-1.5 py-0.5 text-xs font-medium text-white hover:bg-brand-dark disabled:opacity-50"
      >
        Guardar
      </button>
    </span>
  );
}
