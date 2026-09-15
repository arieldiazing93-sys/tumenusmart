"use client";

import { useRef, useState, useTransition } from "react";
import { agregarOpcion } from "../actions";

export function AgregarOpcionForm({ productId }: { productId: string }) {
  const [pendiente, iniciar] = useTransition();
  const [agregado, setAgregado] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  function alAgregar(formData: FormData) {
    iniciar(async () => {
      const resultado = await agregarOpcion(productId, formData);
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
    <form ref={formRef} action={alAgregar} className="flex flex-wrap items-end gap-2">
      <input
        name="nombre"
        required
        placeholder="Nombre (ej: Extra queso, Borde relleno)"
        className="min-w-[180px] flex-1 rounded-lg border border-linea px-3 py-2 text-sm"
      />
      <input
        type="number"
        name="precioExtra"
        step="1"
        min="0"
        defaultValue={0}
        placeholder="Precio extra"
        onWheel={(e) => e.currentTarget.blur()}
        className="w-32 rounded-lg border border-linea px-3 py-2 text-sm"
      />
      <input
        type="number"
        name="costo"
        step="1"
        min="0"
        placeholder="Costo (opcional)"
        title="Lo que te cuesta a vos, no lo que le cobrás al cliente. Sin esto, el reporte de Rentabilidad no puede calcular bien el margen de lo que se vende con este agregado."
        onWheel={(e) => e.currentTarget.blur()}
        className="w-36 rounded-lg border border-linea px-3 py-2 text-sm"
      />
      <button
        type="submit"
        disabled={pendiente}
        className="rounded-lg bg-noche-panel px-4 py-2 text-sm font-medium text-white hover:bg-noche-panel disabled:opacity-50"
      >
        Agregar
      </button>
      {agregado && <span className="text-xs font-medium text-exito">✓ Agregado</span>}
    </form>
  );
}
