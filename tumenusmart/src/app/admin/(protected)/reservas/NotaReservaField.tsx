"use client";

import { useState } from "react";
import { actualizarNotaReserva } from "./actions";

export function NotaReservaField({ id, nota }: { id: string; nota: string | null }) {
  const [texto, setTexto] = useState(nota ?? "");
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    setGuardando(true);
    setError(null);
    setGuardado(false);
    try {
      await actualizarNotaReserva(id, texto);
      setGuardado(true);
      setTimeout(() => setGuardado(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la nota");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="mt-3 border-t border-linea-fina pt-3">
      <label className="mb-1 block text-xs font-medium text-tinta-media">
        Nota interna (ej: pidió globos y velitas) — no la ve el cliente
      </label>
      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        rows={2}
        placeholder="Notas para el encargado..."
        className="w-full rounded-lg border border-linea px-3 py-2 text-sm"
      />
      <div className="mt-1 flex items-center gap-2">
        <button
          type="button"
          onClick={guardar}
          disabled={guardando}
          className="rounded-lg bg-noche-panel px-3 py-1.5 text-xs font-medium text-white hover:bg-noche-panel disabled:opacity-50"
        >
          {guardando ? "Guardando..." : "Guardar nota"}
        </button>
        {guardado && <span className="text-xs text-exito">✓ Guardada</span>}
        {error && <span className="text-xs text-peligro">{error}</span>}
      </div>
    </div>
  );
}
