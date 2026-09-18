"use client";

import { useState, useTransition } from "react";
import { renombrarArea, alternarActivaArea } from "./actions";
import { Entrada, clasesBoton } from "@/components/ui";

export function AreaFila({
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
      const resultado = await renombrarArea(id, nombreEditado);
      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }
      setEditando(false);
      setGuardado(true);
      setTimeout(() => setGuardado(false), 2000);
    });
  }

  return (
    <div
      className={`rounded-lg border bg-white px-4 py-3 ${
        activa ? "border-linea" : "border-linea opacity-60"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        {editando ? (
          <div className="flex flex-1 items-center gap-2">
            <Entrada
              autoFocus
              value={nombreEditado}
              onChange={(e) => setNombreEditado(e.target.value)}
              className="flex-1"
            />
            <button
              type="button"
              disabled={pending}
              onClick={guardarNombre}
              className={clasesBoton("principal", "sm")}
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
              className="text-sm text-tinta-media hover:underline"
            >
              Cancelar
            </button>
          </div>
        ) : (
          <span className="font-medium">
            {nombre}
            {!activa && <span className="ml-2 text-xs font-normal text-tinta-suave">(desactivada)</span>}
            {guardado && <span className="ml-2 text-xs font-normal text-exito">✓ Guardado</span>}
          </span>
        )}

        {!editando && (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-tinta-media">{cantidadProductos} producto(s)</span>
            <button
              type="button"
              onClick={() => setEditando(true)}
              className="text-tinta-media hover:underline"
            >
              Renombrar
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => startTransition(() => alternarActivaArea(id, !activa))}
              className="text-tinta-media hover:underline disabled:opacity-50"
            >
              {activa ? "Desactivar" : "Reactivar"}
            </button>
          </div>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-peligro">{error}</p>}
    </div>
  );
}
