"use client";

import { useState, useTransition } from "react";
import { actualizarPrecioExtraOpcion } from "../actions";

/**
 * Cargar o corregir el precio extra (lo que paga el cliente) de un agregado
 * ya existente, sin tener que borrarlo y crearlo de nuevo — mismo patrón que
 * `EditarCostoOpcion`, para el otro número de la fila.
 */
export function EditarPrecioExtraOpcion({
  productId,
  optionId,
  precioActual,
}: {
  productId: string;
  optionId: string;
  precioActual: number;
}) {
  const [pendiente, iniciar] = useTransition();
  const [valor, setValor] = useState(String(precioActual));
  const [guardado, setGuardado] = useState(false);

  function guardar() {
    iniciar(async () => {
      const datos = new FormData();
      datos.set("precioExtra", valor);
      const resultado = await actualizarPrecioExtraOpcion(productId, optionId, datos);
      if (!resultado.ok) {
        alert(resultado.error);
        return;
      }
      setGuardado(true);
      setTimeout(() => setGuardado(false), 2500);
    });
  }

  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-tinta-suave">Precio +Gs.</span>
      <input
        type="number"
        min="0"
        step="1"
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        placeholder="0"
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
      {guardado && <span className="text-xs font-medium text-exito">✓</span>}
    </span>
  );
}
