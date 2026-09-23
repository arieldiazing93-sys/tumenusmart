"use client";

import { useState, useTransition } from "react";
import { Tarjeta, Campo, Entrada, Selector, clasesBoton } from "@/components/ui";
import { UNIDADES_MEDIDA, etiquetaUnidadMedida } from "@/lib/unidad-medida";
import { actualizarInsumo } from "../actions";

type Categoria = { id: string; nombre: string };
type Insumo = {
  id: string;
  nombre: string;
  categoriaId: string | null;
  unidadMedida: string;
  stockActual: number;
  stockMinimo: number | null;
  costoUnitario: number | null;
  activo: boolean;
};

export function EditarInsumoForm({ insumo, categorias }: { insumo: Insumo; categorias: Categoria[] }) {
  const [pendiente, iniciar] = useTransition();
  const [nuevaCategoria, setNuevaCategoria] = useState(false);

  function alGuardar(formData: FormData) {
    iniciar(async () => {
      // Si sale bien, actualizarInsumo redirige sola — este código no sigue.
      const resultado = await actualizarInsumo(insumo.id, formData);
      if (resultado && !resultado.ok) alert(resultado.error);
    });
  }

  return (
    <form action={alGuardar} className="flex flex-col gap-4">
      <Tarjeta className="flex flex-col gap-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Campo etiqueta="Nombre">
            <Entrada name="nombre" required defaultValue={insumo.nombre} />
          </Campo>

          <div>
            <Campo etiqueta="Categoría (opcional)">
              {!nuevaCategoria ? (
                <Selector name="categoriaId" defaultValue={insumo.categoriaId ?? ""}>
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
              className="mt-1 text-xs text-brand hover:underline"
            >
              {nuevaCategoria ? "Elegir una categoría existente" : "+ Nueva categoría"}
            </button>
          </div>

          <Campo etiqueta="Unidad de medida">
            <Selector name="unidadMedida" defaultValue={insumo.unidadMedida}>
              {UNIDADES_MEDIDA.map((u) => (
                <option key={u.valor} value={u.valor}>
                  {u.etiqueta}
                </option>
              ))}
            </Selector>
          </Campo>
          <Campo
            etiqueta="Stock actual"
            ayuda="No se edita acá — se corrige desde Registro de inventario, para que quede el movimiento en el historial."
          >
            <Entrada
              disabled
              value={`${insumo.stockActual} ${etiquetaUnidadMedida(insumo.unidadMedida)}`}
            />
          </Campo>
          <Campo etiqueta="Stock mínimo (opcional)">
            <Entrada
              type="number"
              name="stockMinimo"
              step="0.001"
              min="0"
              defaultValue={insumo.stockMinimo ?? ""}
            />
          </Campo>
          <Campo etiqueta="Costo unitario (opcional)">
            <Entrada
              type="number"
              name="costoUnitario"
              step="1"
              min="0"
              defaultValue={insumo.costoUnitario ?? ""}
            />
          </Campo>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="activo" defaultChecked={insumo.activo} />
          Activo (disponible para armar recetas nuevas)
        </label>
      </Tarjeta>

      <button type="submit" disabled={pendiente} className={clasesBoton("principal")}>
        {pendiente ? "Guardando…" : "Guardar cambios"}
      </button>
    </form>
  );
}
