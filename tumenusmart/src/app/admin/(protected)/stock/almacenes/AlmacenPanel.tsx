"use client";

import { useState, useTransition } from "react";
import { Tarjeta, Campo, Entrada, Pastilla, clasesBoton } from "@/components/ui";
import { editarAlmacen } from "./actions";

export type AlmacenDatos = { id: string; nombre: string; activo: boolean };

/** Los datos de UN almacén, en el panel de la derecha. Guarda sin salir de la pantalla. */
export function AlmacenPanel({ almacen, alGuardar }: { almacen: AlmacenDatos; alGuardar: () => void }) {
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);

  function guardar(formData: FormData) {
    setError(null);
    iniciar(async () => {
      const resultado = await editarAlmacen(almacen.id, formData);
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
        <h2 className="text-[1.1rem] font-semibold tracking-titular text-tinta">{almacen.nombre}</h2>
        <div className="mt-1">
          <Pastilla color={almacen.activo ? "exito" : "neutro"}>{almacen.activo ? "Activo" : "Desactivado"}</Pastilla>
        </div>
      </div>

      <form action={guardar} className="flex flex-col gap-3">
        <Campo etiqueta="Nombre">
          <Entrada name="nombre" required defaultValue={almacen.nombre} />
        </Campo>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="activo" defaultChecked={almacen.activo} />
          Activo (se puede elegir en las compras)
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
