"use client";

import { useState, useTransition } from "react";
import {
  renombrarCategoria,
  alternarActivaCategoria,
  eliminarCategoria,
} from "./actions";

export function CategoriaFila({
  id,
  nombre,
  activa,
  cantidadProductos,
}: {
  id: string;
  nombre: string;
  activa: boolean;
  cantidadProductos: number;
}) {
  const [pending, startTransition] = useTransition();
  const [editando, setEditando] = useState(false);
  const [nombreEditado, setNombreEditado] = useState(nombre);
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);

  function guardarNombre() {
    setError(null);
    startTransition(async () => {
      try {
        await renombrarCategoria(id, nombreEditado);
        setEditando(false);
        setGuardado(true);
        setTimeout(() => setGuardado(false), 2000);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo guardar");
      }
    });
  }

  return (
    <div
      className={`rounded-lg border bg-white px-4 py-3 ${
        activa ? "border-neutral-200" : "border-neutral-200 opacity-60"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        {editando ? (
          <div className="flex flex-1 items-center gap-2">
            <input
              autoFocus
              value={nombreEditado}
              onChange={(e) => setNombreEditado(e.target.value)}
              className="flex-1 rounded-lg border border-neutral-300 px-2 py-1 text-sm"
            />
            <button
              type="button"
              disabled={pending}
              onClick={guardarNombre}
              className="rounded-lg bg-brand px-3 py-1 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50"
            >
              Guardar
            </button>
            <button
              type="button"
              onClick={() => {
                setNombreEditado(nombre);
                setEditando(false);
                setError(null);
              }}
              className="text-sm text-neutral-500 hover:underline"
            >
              Cancelar
            </button>
          </div>
        ) : (
          <span className="font-medium">
            {nombre}
            {!activa && (
              <span className="ml-2 text-xs font-normal text-neutral-400">(oculta)</span>
            )}
            {guardado && (
              <span className="ml-2 text-xs font-normal text-green-600">✓ Guardado</span>
            )}
          </span>
        )}

        {!editando && (
          <div className="flex items-center gap-4 text-sm">
            <span className="text-neutral-500">{cantidadProductos} producto(s)</span>
            <button
              type="button"
              onClick={() => setEditando(true)}
              className="text-neutral-600 hover:underline"
            >
              Editar
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => startTransition(() => alternarActivaCategoria(id, !activa))}
              className="text-neutral-600 hover:underline disabled:opacity-50"
            >
              {activa ? "Ocultar" : "Mostrar"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (!confirm("¿Borrar esta categoría?")) return;
                startTransition(async () => {
                  try {
                    await eliminarCategoria(id);
                  } catch (err) {
                    alert(err instanceof Error ? err.message : "No se pudo borrar");
                  }
                });
              }}
              className="text-red-500 hover:underline disabled:opacity-50"
            >
              Borrar
            </button>
          </div>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
