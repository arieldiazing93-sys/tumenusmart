"use client";

import { useState, useTransition } from "react";
import {
  renombrarCategoria,
  alternarActivaCategoria,
  eliminarCategoria,
  moverCategoria,
} from "./actions";
import { BotonesMover } from "@/components/BotonesMover";
import { clasesBoton } from "@/components/ui";

export function CategoriaFila({
  id,
  nombre,
  activa,
  cantidadProductos,
  esPrimera,
  esUltima,
}: {
  id: string;
  nombre: string;
  activa: boolean;
  cantidadProductos: number;
  esPrimera: boolean;
  esUltima: boolean;
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
        activa ? "border-linea" : "border-linea opacity-60"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        {!editando && (
          <BotonesMover
            id={id}
            accion={moverCategoria}
            esPrimero={esPrimera}
            esUltimo={esUltima}
            etiqueta={nombre}
          />
        )}

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
          <span className="font-medium">
            {nombre}
            {!activa && (
              <span className="ml-2 text-xs font-normal text-tinta-suave">(oculta)</span>
            )}
            {guardado && (
              <span className="ml-2 text-xs font-normal text-exito">✓ Guardado</span>
            )}
          </span>
        )}

        {!editando && (
          <div className="flex items-center gap-4 text-sm">
            <span className="text-tinta-media">{cantidadProductos} producto(s)</span>
            <button
              type="button"
              onClick={() => setEditando(true)}
              className="text-tinta-media hover:underline"
            >
              Editar
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => startTransition(() => alternarActivaCategoria(id, !activa))}
              className="text-tinta-media hover:underline disabled:opacity-50"
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
              className="text-peligro hover:underline disabled:opacity-50"
            >
              Borrar
            </button>
          </div>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-peligro">{error}</p>}
    </div>
  );
}
