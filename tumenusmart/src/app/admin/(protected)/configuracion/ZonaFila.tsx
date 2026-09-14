"use client";

import { useState, useTransition } from "react";
import { formatearGuarani } from "@/lib/format";
import { clasesBoton } from "@/components/ui";
import { eliminarZona, alternarActivaZona, renombrarZona } from "./actions";

/** Mismo patrón de "editar nombre inline" que ya usa CategoriaFila.tsx —
 * un click abre el campo en el lugar, sin ir a otra pantalla. */
export function ZonaFila({
  id,
  nombre,
  radioKm,
  costoEnvio,
  activo,
}: {
  id: string;
  nombre: string;
  radioKm: number;
  costoEnvio: number;
  activo: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [editando, setEditando] = useState(false);
  const [nombreEditado, setNombreEditado] = useState(nombre);
  const [error, setError] = useState<string | null>(null);

  function guardarNombre() {
    setError(null);
    startTransition(async () => {
      const resultado = await renombrarZona(id, nombreEditado);
      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }
      setEditando(false);
    });
  }

  function borrar() {
    if (!confirm("¿Borrar esta zona? No se puede deshacer.")) return;
    startTransition(async () => {
      // alert() y no un texto en pantalla: el mensaje explica por qué no se
      // pudo borrar y qué hacer en su lugar, y es demasiado largo para un
      // texto chico al lado del botón.
      const resultado = await eliminarZona(id);
      if (!resultado.ok) alert(resultado.error);
    });
  }

  return (
    <div
      className={`flex flex-col gap-2 rounded-lg border border-linea bg-white px-4 py-2 sm:flex-row sm:items-center sm:justify-between ${
        activo ? "" : "opacity-60"
      }`}
    >
      {editando ? (
        <div className="flex flex-1 items-center gap-2">
          <input
            autoFocus
            value={nombreEditado}
            onChange={(e) => setNombreEditado(e.target.value)}
            className="flex-1 rounded-lg border border-linea px-2 py-1 text-sm"
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
        <span>
          {nombre} <span className="text-tinta-suave">— hasta {radioKm} km</span>
          {!activo && (
            <span className="ml-2 text-xs font-normal text-tinta-suave">(inactiva)</span>
          )}
        </span>
      )}

      {!editando && (
        <div className="flex items-center gap-4">
          <span className="text-sm text-tinta-media">{formatearGuarani(costoEnvio)}</span>
          <button
            type="button"
            onClick={() => setEditando(true)}
            className="text-sm text-tinta-media hover:underline"
          >
            Editar
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => startTransition(() => alternarActivaZona(id, !activo))}
            className="text-sm text-tinta-media hover:underline disabled:opacity-50"
          >
            {activo ? "Desactivar" : "Activar"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={borrar}
            className="text-sm text-peligro hover:underline disabled:opacity-50"
          >
            Borrar
          </button>
        </div>
      )}
      {error && <p className="text-xs text-peligro">{error}</p>}
    </div>
  );
}
