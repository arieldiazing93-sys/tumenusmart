"use client";

import { useRef, useState, useTransition } from "react";
import { Tarjeta, Campo, Entrada, clasesBoton } from "@/components/ui";
import { crearGrupo } from "./actions";

export function CrearGrupoForm() {
  const [pendiente, iniciar] = useTransition();
  const [agregado, setAgregado] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  function alCrear(formData: FormData) {
    iniciar(async () => {
      const resultado = await crearGrupo(formData);
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
      <p className="rotulo text-[0.8rem] font-bold">Nuevo grupo</p>
      <form ref={formRef} action={alCrear} className="flex flex-wrap items-end gap-3">
        <div className="min-w-[14rem] flex-1">
          <Campo etiqueta="Nombre">
            <Entrada name="nombre" required placeholder="Ej: Salsas, Quesos, Toppings" />
          </Campo>
        </div>
        <div className="flex items-center gap-2">
          <button type="submit" disabled={pendiente} className={clasesBoton("principal")}>
            {pendiente ? "Creando…" : "Crear grupo"}
          </button>
          {agregado && <span className="text-xs font-medium text-exito">✓ Creado</span>}
        </div>
      </form>
    </Tarjeta>
  );
}
