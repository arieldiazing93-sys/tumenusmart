"use client";

import { useState, useTransition } from "react";
import { actualizarNombreOpcion } from "../actions";

/**
 * Corregir el nombre de un agregado ya cargado — el típico "lo escribí mal" —
 * sin tener que borrarlo y volver a crearlo (que haría perder el precio y el
 * costo ya configurados). Mismo patrón de "click para editar" que ya usa
 * CategoriaFila.tsx.
 */
export function EditarNombreOpcion({
  productId,
  optionId,
  nombreActual,
  sinCosto,
}: {
  productId: string;
  optionId: string;
  nombreActual: string;
  sinCosto: boolean;
}) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(nombreActual);
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function guardar() {
    setError(null);
    const limpio = valor.trim();
    if (!limpio) {
      setError("El nombre no puede quedar vacío");
      return;
    }
    iniciar(async () => {
      const datos = new FormData();
      datos.set("nombre", limpio);
      const resultado = await actualizarNombreOpcion(productId, optionId, datos);
      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }
      setEditando(false);
    });
  }

  function cancelar() {
    setValor(nombreActual);
    setEditando(false);
    setError(null);
  }

  if (editando) {
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <input
          autoFocus
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              guardar();
            }
            if (e.key === "Escape") cancelar();
          }}
          className="rounded border border-linea px-1.5 py-0.5 text-sm focus:border-brand focus:outline-none"
        />
        <button
          type="button"
          onClick={guardar}
          disabled={pendiente}
          className="rounded bg-brand px-1.5 py-0.5 text-xs font-medium text-white hover:bg-brand-dark disabled:opacity-50"
        >
          Guardar
        </button>
        <button
          type="button"
          onClick={cancelar}
          disabled={pendiente}
          className="text-xs text-tinta-media hover:underline disabled:opacity-50"
        >
          Cancelar
        </button>
        {error && <span className="text-xs text-peligro">{error}</span>}
      </span>
    );
  }

  return (
    <span>
      {nombreActual}
      {sinCosto && <span className="text-aviso"> · sin costo cargado</span>}
      <button
        type="button"
        onClick={() => setEditando(true)}
        className="ml-1.5 text-xs text-tinta-media hover:underline"
      >
        Editar
      </button>
    </span>
  );
}
