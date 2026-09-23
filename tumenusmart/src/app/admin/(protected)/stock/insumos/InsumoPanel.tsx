"use client";

import { useEffect, useState, useTransition } from "react";
import { Tarjeta, Campo, Entrada, Selector, Pastilla, clasesBoton } from "@/components/ui";
import { UNIDADES_MEDIDA } from "@/lib/unidad-medida";
import { TASAS_IVA } from "@/lib/iva";
import { actualizarInsumo } from "./actions";

export type InsumoDatos = {
  id: string;
  nombre: string;
  categoriaId: string | null;
  unidadMedida: string;
  iva: string;
  rendimiento: number;
  stockActual: number;
  stockMinimo: number | null;
  costoUnitario: number | null;
  activo: boolean;
};

type Categoria = { id: string; nombre: string };

/**
 * Los datos de UN insumo, en el panel de la derecha. Se abre con doble clic
 * sobre la lista y guarda sin salir de la pantalla.
 *
 * El stock no se edita acá: se corrige desde Registro de inventario, para que
 * cada cambio quede como un movimiento en el historial.
 */
export function InsumoPanel({
  insumo,
  categorias,
  onGuardado,
}: {
  insumo: InsumoDatos;
  categorias: Categoria[];
  onGuardado: () => void;
}) {
  const [pendiente, iniciar] = useTransition();
  const [nuevaCategoria, setNuevaCategoria] = useState(false);
  const [categoriaId, setCategoriaId] = useState(insumo.categoriaId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);

  // Si se creó una categoría nueva al guardar, el id recién llega con los
  // datos refrescados: se sincroniza para que el desplegable la muestre.
  useEffect(() => {
    setCategoriaId(insumo.categoriaId ?? "");
  }, [insumo.categoriaId]);

  const negativo = insumo.stockActual < 0;
  const bajoMinimo = insumo.stockMinimo != null && insumo.stockActual < insumo.stockMinimo;

  function alGuardar(formData: FormData) {
    setError(null);
    iniciar(async () => {
      const resultado = await actualizarInsumo(insumo.id, formData);
      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }
      setNuevaCategoria(false);
      setGuardado(true);
      onGuardado();
      setTimeout(() => setGuardado(false), 2500);
    });
  }

  return (
    <Tarjeta className="flex flex-col gap-4">
      <div>
        <h2 className="text-[1.1rem] font-semibold tracking-titular text-tinta">{insumo.nombre}</h2>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Pastilla color={insumo.activo ? "exito" : "neutro"}>{insumo.activo ? "Activo" : "Desactivado"}</Pastilla>
          {negativo && <Pastilla color="peligro">Stock negativo</Pastilla>}
          {!negativo && bajoMinimo && <Pastilla color="aviso">Bajo el mínimo</Pastilla>}
        </div>
      </div>

      <form action={alGuardar} className="campos-grises flex flex-col gap-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Campo etiqueta="Nombre">
            <Entrada name="nombre" required defaultValue={insumo.nombre} />
          </Campo>

          <div>
            <Campo etiqueta="Categoría (opcional)">
              {!nuevaCategoria ? (
                <Selector name="categoriaId" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
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
            <Selector name="unidadMedida" defaultValue={insumo.unidadMedida}>
              {UNIDADES_MEDIDA.map((u) => (
                <option key={u.valor} value={u.valor}>
                  {u.etiqueta}
                </option>
              ))}
            </Selector>
          </Campo>
          <Campo etiqueta="IVA" ayuda="Para armar la factura cuando se compra este insumo.">
            <Selector name="iva" defaultValue={insumo.iva}>
              {TASAS_IVA.map((t) => (
                <option key={t.valor} value={t.valor}>
                  {t.etiqueta}
                </option>
              ))}
            </Selector>
          </Campo>
          <Campo
            etiqueta="Rendimiento"
            ayuda="Unidades que trae cada compra. Ej: un pack de 12 latas → 12."
          >
            <Entrada
              type="number"
              name="rendimiento"
              step="0.001"
              min="0.001"
              required
              defaultValue={insumo.rendimiento}
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
            {/* El costo que sale de una compra puede traer decimales (3787,88).
                En guaraníes se muestra entero: con decimales el navegador
                rechazaba el guardado por "valor inválido". */}
            <Entrada
              type="number"
              name="costoUnitario"
              step="1"
              min="0"
              defaultValue={insumo.costoUnitario != null ? Math.round(insumo.costoUnitario) : ""}
            />
          </Campo>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="activo" defaultChecked={insumo.activo} />
          Activo (disponible para armar recetas nuevas)
        </label>

        {error && <p className="text-sm font-medium text-peligro">{error}</p>}
        <div className="flex items-center gap-3">
          <button type="submit" disabled={pendiente} className={clasesBoton("principal")}>
            {pendiente ? "Guardando…" : "Guardar cambios"}
          </button>
          {guardado && <span className="text-xs font-medium text-exito">✓ Guardado</span>}
        </div>
      </form>
    </Tarjeta>
  );
}
