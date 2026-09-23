"use client";

import { useRef, useTransition } from "react";
import { Tarjeta, Campo, Entrada, clasesBoton } from "@/components/ui";
import { crearAlmacen } from "./actions";

/** Alta de un almacén: solo el nombre. Todo lo demás se edita después, en el panel. */
export function CrearAlmacenForm({ onCreado }: { onCreado: (almacenId: string) => void }) {
  const [pendiente, iniciar] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function alCrear(formData: FormData) {
    iniciar(async () => {
      const resultado = await crearAlmacen(formData);
      if (!resultado.ok) {
        alert(resultado.error);
        return;
      }
      formRef.current?.reset();
      onCreado(resultado.almacenId);
    });
  }

  return (
    <Tarjeta className="flex flex-col gap-3">
      <p className="rotulo text-[0.8rem] font-bold">Nuevo almacén</p>
      <form ref={formRef} action={alCrear} className="flex flex-col gap-3">
        <Campo etiqueta="Nombre">
          <Entrada name="nombre" required autoFocus placeholder="Ej: Almacén Cocina" />
        </Campo>
        <div>
          <button type="submit" disabled={pendiente} className={clasesBoton("principal")}>
            {pendiente ? "Agregando…" : "Agregar"}
          </button>
        </div>
      </form>
    </Tarjeta>
  );
}
