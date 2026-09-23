"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Tarjeta, Campo, Entrada, Selector, clasesBoton } from "@/components/ui";
import { UNIDADES_MEDIDA } from "@/lib/unidad-medida";
import { TASAS_IVA } from "@/lib/iva";
import { crearInsumo } from "./actions";

type Categoria = { id: string; nombre: string };

export function CrearInsumoForm({ categorias }: { categorias: Categoria[] }) {
  const [pendiente, iniciar] = useTransition();
  const [agregado, setAgregado] = useState(false);
  const [nuevaCategoria, setNuevaCategoria] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  function alCrear(formData: FormData) {
    iniciar(async () => {
      const resultado = await crearInsumo(formData);
      if (!resultado.ok) {
        alert(resultado.error);
        return;
      }
      formRef.current?.reset();
      setNuevaCategoria(false);
      setAgregado(true);
      router.refresh();
      setTimeout(() => setAgregado(false), 2500);
    });
  }

  return (
    <Tarjeta className="mb-6 flex flex-col gap-3">
      <p className="rotulo text-[0.8rem] font-bold">Nuevo insumo</p>
      <form ref={formRef} action={alCrear} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Campo etiqueta="Nombre">
          <Entrada name="nombre" required placeholder="Ej: Carne molida" />
        </Campo>

        <div>
          <Campo etiqueta="Categoría (opcional)">
            {!nuevaCategoria ? (
              <Selector name="categoriaId" defaultValue="">
                <option value="">Sin categoría</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </Selector>
            ) : (
              <Entrada name="categoriaNueva" placeholder="Nombre de la categoría nueva" autoFocus />
            )}
          </Campo>
          <button
            type="button"
            onClick={() => setNuevaCategoria((v) => !v)}
            className={`mt-1.5 ${clasesBoton("suave", "sm")}`}
          >
            {nuevaCategoria ? "Elegir una categoría existente" : "+ Nueva categoría"}
          </button>
        </div>

        <Campo etiqueta="Unidad de medida">
          <Selector name="unidadMedida" defaultValue="unidad">
            {UNIDADES_MEDIDA.map((u) => (
              <option key={u.valor} value={u.valor}>
                {u.etiqueta}
              </option>
            ))}
          </Selector>
        </Campo>
        <Campo etiqueta="IVA" ayuda="Para armar la factura cuando se compra este insumo.">
          <Selector name="iva" defaultValue="gravado10">
            {TASAS_IVA.map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.etiqueta}
              </option>
            ))}
          </Selector>
        </Campo>
        <Campo etiqueta="Stock inicial">
          <Entrada type="number" name="stockInicial" step="0.001" min="0" placeholder="0" />
        </Campo>
        <Campo etiqueta="Stock mínimo (opcional)" ayuda="Para avisar cuando conviene reponer.">
          <Entrada type="number" name="stockMinimo" step="0.001" min="0" />
        </Campo>
        <Campo etiqueta="Costo unitario (opcional)">
          <Entrada type="number" name="costoUnitario" step="1" min="0" placeholder="Gs." />
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
