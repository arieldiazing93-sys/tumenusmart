"use client";

import { useRef, useState, useTransition } from "react";
import { Tarjeta, Campo, Entrada, clasesBoton } from "@/components/ui";
import { crearProveedor } from "./actions";

export function CrearProveedorForm() {
  const [pendiente, iniciar] = useTransition();
  const [agregado, setAgregado] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  function alCrear(formData: FormData) {
    iniciar(async () => {
      const resultado = await crearProveedor(formData);
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
      <p className="rotulo text-[0.8rem] font-bold">Nuevo proveedor</p>
      <form ref={formRef} action={alCrear} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Campo etiqueta="Nombre">
          <Entrada name="nombre" required placeholder="Ej: Distribuidora Central" />
        </Campo>
        <Campo etiqueta="Teléfono (opcional)">
          <Entrada name="telefono" placeholder="Ej: 0981234567" />
        </Campo>
        <Campo etiqueta="Email (opcional)" className="sm:col-span-2">
          <Entrada type="email" name="email" placeholder="Ej: ventas@distribuidora.com" />
        </Campo>
        <Campo etiqueta="Notas (opcional)" className="sm:col-span-2">
          <Entrada name="notas" placeholder="Ej: entrega los martes y viernes" />
        </Campo>
        <div className="flex items-center gap-2 sm:col-span-2">
          <button type="submit" disabled={pendiente} className={clasesBoton("principal")}>
            {pendiente ? "Agregando…" : "Agregar"}
          </button>
          {agregado && <span className="text-xs font-medium text-exito">✓ Agregado</span>}
        </div>
      </form>
    </Tarjeta>
  );
}
