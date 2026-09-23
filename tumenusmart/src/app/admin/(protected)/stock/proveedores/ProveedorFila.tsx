"use client";

import { useState, useTransition } from "react";
import { editarProveedor, alternarActivoProveedor } from "./actions";
import { Entrada, clasesBoton } from "@/components/ui";

export function ProveedorFila({
  id,
  nombre,
  telefono,
  email,
  notas,
  activo,
}: {
  id: string;
  nombre: string;
  telefono: string;
  email: string;
  notas: string;
  activo: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [editando, setEditando] = useState(false);
  const [datos, setDatos] = useState({ nombre, telefono, email, notas });
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);

  function guardar() {
    setError(null);
    startTransition(async () => {
      const resultado = await editarProveedor(id, datos);
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
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Entrada
              autoFocus
              value={datos.nombre}
              onChange={(e) => setDatos((d) => ({ ...d, nombre: e.target.value }))}
              placeholder="Nombre"
            />
            <Entrada
              value={datos.telefono}
              onChange={(e) => setDatos((d) => ({ ...d, telefono: e.target.value }))}
              placeholder="Teléfono"
            />
            <Entrada
              type="email"
              value={datos.email}
              onChange={(e) => setDatos((d) => ({ ...d, email: e.target.value }))}
              placeholder="Email"
              className="sm:col-span-2"
            />
            <Entrada
              value={datos.notas}
              onChange={(e) => setDatos((d) => ({ ...d, notas: e.target.value }))}
              placeholder="Notas"
              className="sm:col-span-2"
            />
          </div>
          <div className="flex items-center gap-2">
            <button type="button" disabled={pending} onClick={guardar} className={clasesBoton("principal", "sm")}>
              Guardar
            </button>
            <button
              type="button"
              onClick={() => {
                setDatos({ nombre, telefono, email, notas });
                setEditando(false);
                setError(null);
              }}
              className="text-sm text-tinta-media hover:underline"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="font-medium">
              {nombre}
              {!activo && <span className="ml-2 text-xs font-normal text-tinta-suave">(desactivado)</span>}
              {guardado && <span className="ml-2 text-xs font-normal text-exito">✓ Guardado</span>}
            </span>
            {(telefono || email) && (
              <p className="text-xs text-tinta-media">{[telefono, email].filter(Boolean).join(" · ")}</p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <button type="button" onClick={() => setEditando(true)} className="text-tinta-media hover:underline">
              Editar
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => startTransition(() => alternarActivoProveedor(id, !activo))}
              className="text-tinta-media hover:underline disabled:opacity-50"
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
