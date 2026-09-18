"use client";

import { useRef, useState, useTransition } from "react";
import { Tarjeta, Campo, Entrada, clasesBoton } from "@/components/ui";
import { crearArea } from "./actions";

export function CrearAreaForm() {
  const [pendiente, iniciar] = useTransition();
  const [agregada, setAgregada] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  function alCrear(formData: FormData) {
    iniciar(async () => {
      const resultado = await crearArea(formData);
      if (!resultado.ok) {
        alert(resultado.error);
        return;
      }
      formRef.current?.reset();
      setAgregada(true);
      setTimeout(() => setAgregada(false), 2500);
    });
  }

  return (
    <Tarjeta className="mb-6 flex flex-col gap-3">
      <p className="rotulo text-[0.8rem] font-bold">Nueva área de impresión</p>
      <form ref={formRef} action={alCrear} className="flex flex-wrap items-end gap-3">
        <div className="min-w-[14rem] flex-1">
          <Campo etiqueta="Nombre">
            <Entrada name="nombre" required placeholder="Ej: Cocina, Barra, Caja" />
          </Campo>
        </div>
        <div className="flex items-center gap-2">
          <button type="submit" disabled={pendiente} className={clasesBoton("principal")}>
            {pendiente ? "Agregando…" : "Agregar"}
          </button>
          {agregada && <span className="text-xs font-medium text-exito">✓ Agregada</span>}
        </div>
      </form>
    </Tarjeta>
  );
}
