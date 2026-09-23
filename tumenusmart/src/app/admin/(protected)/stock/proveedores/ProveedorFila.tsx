"use client";

import { useState, useTransition } from "react";
import { editarProveedor, alternarActivoProveedor } from "./actions";
import { Entrada, Pastilla, clasesBoton } from "@/components/ui";

export function ProveedorFila({
  id,
  nombre,
  razonSocial,
  ruc,
  telefono,
  ciudad,
  email,
  notas,
  activo,
}: {
  id: string;
  nombre: string;
  razonSocial: string;
  ruc: string;
  telefono: string;
  ciudad: string;
  email: string;
  notas: string;
  activo: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [editando, setEditando] = useState(false);
  const [datos, setDatos] = useState({ nombre, razonSocial, ruc, telefono, ciudad, email, notas });
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

  const subtitulo = [razonSocial, ruc && `RUC ${ruc}`, telefono, ciudad, email].filter(Boolean).join(" · ");

  return (
    <div className={`rounded-lg border bg-superficie px-4 py-3 ${activo ? "border-linea" : "border-linea opacity-60"}`}>
      {editando ? (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Entrada
              autoFocus
              value={datos.nombre}
              onChange={(e) => setDatos((d) => ({ ...d, nombre: e.target.value }))}
              placeholder="Nombre comercial"
            />
            <Entrada
              value={datos.razonSocial}
              onChange={(e) => setDatos((d) => ({ ...d, razonSocial: e.target.value }))}
              placeholder="Razón social"
            />
            <Entrada
              value={datos.ruc}
              onChange={(e) => setDatos((d) => ({ ...d, ruc: e.target.value }))}
              placeholder="RUC"
            />
            <Entrada
              value={datos.telefono}
              onChange={(e) => setDatos((d) => ({ ...d, telefono: e.target.value }))}
              placeholder="Teléfono"
            />
            <Entrada
              value={datos.ciudad}
              onChange={(e) => setDatos((d) => ({ ...d, ciudad: e.target.value }))}
              placeholder="Ciudad"
            />
            <Entrada
              type="email"
              value={datos.email}
              onChange={(e) => setDatos((d) => ({ ...d, email: e.target.value }))}
              placeholder="Email"
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
                setDatos({ nombre, razonSocial, ruc, telefono, ciudad, email, notas });
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
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{nombre}</span>
              <Pastilla color={activo ? "exito" : "neutro"}>{activo ? "Activo" : "Desactivado"}</Pastilla>
              {guardado && <span className="text-xs font-normal text-exito">✓ Guardado</span>}
            </div>
            {subtitulo && <p className="mt-0.5 text-xs text-tinta-media">{subtitulo}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <button type="button" onClick={() => setEditando(true)} className={clasesBoton("suave", "sm")}>
              Editar
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => startTransition(() => alternarActivoProveedor(id, !activo))}
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
