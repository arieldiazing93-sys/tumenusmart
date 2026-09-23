"use client";

import { useRef, useState, useTransition } from "react";
import { Tarjeta, Campo, Entrada, Selector, clasesBoton } from "@/components/ui";
import { CATEGORIAS_GASTO } from "@/lib/categoria-gasto";
import { crearGasto } from "./actions";

type Proveedor = { id: string; nombre: string };

export function CrearGastoForm({ proveedores }: { proveedores: Proveedor[] }) {
  const [pendiente, iniciar] = useTransition();
  const [agregado, setAgregado] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const hoy = new Date().toISOString().slice(0, 10);

  function alCrear(formData: FormData) {
    iniciar(async () => {
      const resultado = await crearGasto(formData);
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
      <p className="rotulo text-[0.8rem] font-bold">Nuevo gasto</p>
      <form ref={formRef} action={alCrear} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Campo etiqueta="Concepto">
          <Entrada name="concepto" required placeholder="Ej: Alquiler de septiembre" />
        </Campo>
        <Campo etiqueta="Categoría">
          <Selector name="categoria" defaultValue="otros">
            {CATEGORIAS_GASTO.map((c) => (
              <option key={c.valor} value={c.valor}>
                {c.etiqueta}
              </option>
            ))}
          </Selector>
        </Campo>
        <Campo etiqueta="Monto">
          <Entrada type="number" name="monto" required step="1" min="0" placeholder="Gs." />
        </Campo>
        <Campo etiqueta="Fecha">
          <Entrada type="date" name="fecha" defaultValue={hoy} />
        </Campo>
        <Campo etiqueta="Proveedor (opcional)">
          <Selector name="proveedorId" defaultValue="">
            <option value="">Sin proveedor</option>
            {proveedores.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </Selector>
        </Campo>
        <Campo etiqueta="Notas (opcional)">
          <Entrada name="notas" />
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
