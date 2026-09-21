"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { renombrarGrupo, eliminarGrupo, type ResultadoGrupo } from "./actions";
import { Entrada, clasesBoton } from "@/components/ui";
import { BotonesMover } from "@/components/BotonesMover";
import type { Direccion } from "@/lib/ordenar";

export function GrupoFila({
  id,
  nombre,
  cantidadItems,
  cantidadProductos,
  esPrimero,
  esUltimo,
  moverGrupo,
}: {
  id: string;
  nombre: string;
  cantidadItems: number;
  cantidadProductos: number;
  esPrimero: boolean;
  esUltimo: boolean;
  moverGrupo: (id: string, direccion: Direccion) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const [editando, setEditando] = useState(false);
  const [nombreEditado, setNombreEditado] = useState(nombre);
  const [error, setError] = useState<string | null>(null);

  function guardarNombre() {
    setError(null);
    startTransition(async () => {
      const resultado = await renombrarGrupo(id, nombreEditado);
      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }
      setEditando(false);
    });
  }

  function borrar() {
    if (!confirm(`¿Borrar el grupo "${nombre}"? No se puede deshacer.`)) return;
    setError(null);
    startTransition(async () => {
      const resultado: ResultadoGrupo = await eliminarGrupo(id);
      if (!resultado.ok) alert(resultado.error);
    });
  }

  return (
    <div className="rounded-lg border border-linea bg-white px-4 py-3">
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
          <div className="flex items-center gap-2">
            <BotonesMover
              id={id}
              accion={moverGrupo}
              esPrimero={esPrimero}
              esUltimo={esUltimo}
              etiqueta={nombre}
            />
            <Link href={`/admin/grupos-agregados/${id}`} className="font-medium hover:text-brand">
              {nombre}
            </Link>
          </div>
        )}

        {!editando && (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-tinta-media">
              {cantidadItems} ítem(s) · {cantidadProductos} producto(s)
            </span>
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
              onClick={borrar}
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
