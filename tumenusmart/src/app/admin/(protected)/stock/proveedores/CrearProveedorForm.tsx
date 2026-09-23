"use client";

import { useRef, useTransition } from "react";
import { Tarjeta, Campo, Entrada, clasesBoton } from "@/components/ui";
import { crearProveedor } from "./actions";

export function CrearProveedorForm({ onCreado }: { onCreado: (proveedorId: string) => void }) {
  const [pendiente, iniciar] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function alCrear(formData: FormData) {
    iniciar(async () => {
      const resultado = await crearProveedor(formData);
      if (!resultado.ok) {
        alert(resultado.error);
        return;
      }
      formRef.current?.reset();
      onCreado(resultado.proveedorId);
    });
  }

  return (
    <Tarjeta className="flex flex-col gap-3">
      <p className="rotulo text-[0.8rem] font-bold">Nuevo proveedor</p>
      <form ref={formRef} action={alCrear} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Campo etiqueta="Nombre comercial">
          <Entrada name="nombre" required autoFocus placeholder="Ej: Distribuidora Central" />
        </Campo>
        <Campo etiqueta="Razón social (opcional)">
          <Entrada name="razonSocial" placeholder="Ej: Distribuidora Central S.A." />
        </Campo>
        <Campo etiqueta="RUC (opcional)">
          <Entrada name="ruc" placeholder="Ej: 80012345-6" />
        </Campo>
        <Campo etiqueta="Teléfono (opcional)">
          <Entrada name="telefono" placeholder="Ej: 0981234567" />
        </Campo>
        <Campo etiqueta="Ciudad (opcional)">
          <Entrada name="ciudad" placeholder="Ej: Asunción" />
        </Campo>
        <Campo etiqueta="Email (opcional)">
          <Entrada type="email" name="email" placeholder="Ej: ventas@distribuidora.com" />
        </Campo>
        <Campo etiqueta="Notas (opcional)" className="sm:col-span-2">
          <Entrada name="notas" placeholder="Ej: entrega los martes y viernes" />
        </Campo>
        <div className="sm:col-span-2">
          <button type="submit" disabled={pendiente} className={clasesBoton("principal")}>
            {pendiente ? "Agregando…" : "Agregar"}
          </button>
        </div>
      </form>
    </Tarjeta>
  );
}
