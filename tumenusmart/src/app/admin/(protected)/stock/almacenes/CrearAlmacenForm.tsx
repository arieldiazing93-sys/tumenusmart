"use client";

import { useRef, useState, useTransition } from "react";
import { Tarjeta, Campo, Entrada, clasesBoton } from "@/components/ui";
import { crearAlmacen } from "./actions";

export function CrearAlmacenForm() {
  const [pendiente, iniciar] = useTransition();
  const [agregado, setAgregado] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  function alCrear(formData: FormData) {
    iniciar(async () => {
      const resultado = await crearAlmacen(formData);
      if (!resultado.ok) {
        alert(resultado.error);
        return;
      }
      formRef.current?.reset();
      setAgregado(true);
      setTimeout(() => setAgregado(false), 2500);
    });
  }

  return (
    <Tarjeta className="mb-6 flex flex-col gap-3">
      <p className="rotulo text-[0.8rem] font-bold">Nuevo almacén</p>
      <form ref={formRef} action={alCrear} className="flex flex-wrap items-end gap-3">
        <div className="w-28">
          <Campo etiqueta="Código">
            <Entrada name="codigo" required placeholder="Ej: 01" />
          </Campo>
        </div>
        <div className="min-w-[14rem] flex-1">
          <Campo etiqueta="Nombre">
            <Entrada name="nombre" required placeholder="Ej: Almacén Cocina" />
          </Campo>
        </div>
        <div className="flex items-center gap-2">
          <button type="submit" disabled={pendiente} className={clasesBoton("principal")}>
            {pendiente ? "Agregando…" : "Agregar"}
          </button>
          {agregado && <span className="text-xs font-medium text-exito">✓ Agregado</span>}
        </div>
      </form>
    </Tarjeta>
  );
}
