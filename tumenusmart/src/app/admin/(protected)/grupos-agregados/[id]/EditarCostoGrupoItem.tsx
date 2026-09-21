"use client";

import { useState, useTransition } from "react";
import { actualizarCostoGrupoItem } from "../actions";

export function EditarCostoGrupoItem({
  groupId,
  itemId,
  costoActual,
}: {
  groupId: string;
  itemId: string;
  costoActual: number | null;
}) {
  const [pendiente, iniciar] = useTransition();
  const [valor, setValor] = useState(costoActual != null ? String(costoActual) : "");
  const [guardado, setGuardado] = useState(false);

  function guardar() {
    iniciar(async () => {
      const datos = new FormData();
      datos.set("costo", valor);
      const resultado = await actualizarCostoGrupoItem(groupId, itemId, datos);
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
      <span className="text-tinta-suave">Costo</span>
      <input
        type="number"
        min="0"
        step="1"
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        onWheel={(e) => e.currentTarget.blur()}
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
      {guardado && <span className="text-xs font-medium text-exito">✓</span>}
    </span>
  );
}
