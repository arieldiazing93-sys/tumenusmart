"use client";

import { useState, useTransition } from "react";
import { editarAlmacen, alternarActivoAlmacen } from "./actions";
import { Entrada, Pastilla, clasesBoton } from "@/components/ui";

export function AlmacenFila({
  id,
  codigo,
  nombre,
  activo,
}: {
  id: string;
  codigo: string;
  nombre: string;
  activo: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [editando, setEditando] = useState(false);
  const [datos, setDatos] = useState({ codigo, nombre });
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);

  function guardar() {
    setError(null);
    startTransition(async () => {
      const resultado = await editarAlmacen(id, datos);
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
    <div className={`rounded-lg border bg-superficie px-4 py-3 ${activo ? "border-linea" : "border-linea opacity-60"}`}>
      {editando ? (
        <div className="flex flex-wrap items-center gap-2">
          <Entrada
            autoFocus
            value={datos.codigo}
            onChange={(e) => setDatos((d) => ({ ...d, codigo: e.target.value }))}
            placeholder="Código"
            className="w-24"
          />
          <Entrada
            value={datos.nombre}
            onChange={(e) => setDatos((d) => ({ ...d, nombre: e.target.value }))}
            placeholder="Nombre"
            className="min-w-[12rem] flex-1"
          />
          <button type="button" disabled={pending} onClick={guardar} className={clasesBoton("principal", "sm")}>
            Guardar
          </button>
          <button
            type="button"
            onClick={() => {
              setDatos({ codigo, nombre });
              setEditando(false);
              setError(null);
            }}
            className="text-sm text-tinta-media hover:underline"
          >
            Cancelar
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">
              <span className="cifra text-tinta-suave">{codigo}</span> — {nombre}
            </span>
            <Pastilla color={activo ? "exito" : "neutro"} punto>
              {activo ? "Activo" : "Desactivado"}
            </Pastilla>
            {guardado && <span className="text-xs font-normal text-exito">✓ Guardado</span>}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <button type="button" onClick={() => setEditando(true)} className={clasesBoton("suave", "sm")}>
              Editar
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => startTransition(() => alternarActivoAlmacen(id, !activo))}
              className={clasesBoton(activo ? "peligro" : "suave", "sm")}
            >
              {activo ? "Desactivar" : "Reactivar"}
            </button>
          </div>
        </div>
      )}
      {error && <p className="mt-1 text-xs text-peligro">{error}</p>}
    </div>
  );
}
