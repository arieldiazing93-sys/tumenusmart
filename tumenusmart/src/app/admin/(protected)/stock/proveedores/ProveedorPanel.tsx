"use client";

import { useState, useTransition } from "react";
import { Tarjeta, Campo, Entrada, Pastilla, clasesBoton } from "@/components/ui";
import { editarProveedor } from "./actions";

export type ProveedorDatos = {
  id: string;
  nombre: string;
  razonSocial: string;
  ruc: string;
  telefono: string;
  ciudad: string;
  email: string;
  notas: string;
  activo: boolean;
};

/** Los datos de UN proveedor, en el panel de la derecha. Guarda sin salir de la pantalla. */
export function ProveedorPanel({
  proveedor,
  alGuardar,
}: {
  proveedor: ProveedorDatos;
  alGuardar: () => void;
}) {
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);

  function guardar(formData: FormData) {
    setError(null);
    iniciar(async () => {
      const resultado = await editarProveedor(proveedor.id, formData);
      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }
      setGuardado(true);
      alGuardar();
      setTimeout(() => setGuardado(false), 2500);
    });
  }

  return (
    <Tarjeta className="flex flex-col gap-4">
      <div>
        <h2 className="text-[1.1rem] font-semibold tracking-titular text-tinta">{proveedor.nombre}</h2>
        <div className="mt-1">
          <Pastilla color={proveedor.activo ? "exito" : "neutro"}>
            {proveedor.activo ? "Activo" : "Desactivado"}
          </Pastilla>
        </div>
      </div>

      <form action={guardar} className="flex flex-col gap-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Campo etiqueta="Nombre comercial">
            <Entrada name="nombre" required defaultValue={proveedor.nombre} />
          </Campo>
          <Campo etiqueta="Razón social (opcional)">
            <Entrada name="razonSocial" defaultValue={proveedor.razonSocial} />
          </Campo>
          <Campo etiqueta="RUC (opcional)">
            <Entrada name="ruc" defaultValue={proveedor.ruc} />
          </Campo>
          <Campo etiqueta="Teléfono (opcional)">
            <Entrada name="telefono" defaultValue={proveedor.telefono} />
          </Campo>
          <Campo etiqueta="Ciudad (opcional)">
            <Entrada name="ciudad" defaultValue={proveedor.ciudad} />
          </Campo>
          <Campo etiqueta="Email (opcional)">
            <Entrada type="email" name="email" defaultValue={proveedor.email} />
          </Campo>
          <Campo etiqueta="Notas (opcional)" className="sm:col-span-2">
            <Entrada name="notas" defaultValue={proveedor.notas} />
          </Campo>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="activo" defaultChecked={proveedor.activo} />
          Activo (se puede elegir en compras y gastos)
        </label>

        {error && <p className="text-sm font-medium text-peligro">{error}</p>}
        <div className="flex items-center gap-3">
          <button type="submit" disabled={pendiente} className={clasesBoton("principal")}>
            {pendiente ? "Guardando…" : "Guardar cambios"}
          </button>
          {guardado && <span className="text-xs font-medium text-exito">✓ Guardado</span>}
        </div>
      </form>
    </Tarjeta>
  );
}
