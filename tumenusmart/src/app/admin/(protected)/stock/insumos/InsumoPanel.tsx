"use client";

import { useEffect, useState, useTransition } from "react";
import { Tarjeta, Campo, Entrada, Selector, Pastilla, clasesBoton } from "@/components/ui";
import { UNIDADES_MEDIDA, etiquetaUnidadMedida } from "@/lib/unidad-medida";
import { TASAS_IVA } from "@/lib/iva";
import { estadoDeStock } from "@/lib/alerta-stock";
import { llamarAlServidor } from "@/lib/llamar-servidor";
import { alEnviar } from "@/lib/formulario";
import { actualizarInsumo } from "./actions";
import { RecetaElaborado, type IngredienteDatos } from "./RecetaElaborado";

export type InsumoDatos = {
  id: string;
  nombre: string;
  categoriaId: string | null;
  unidadMedida: string;
  iva: string;
  rendimiento: number;
  stockActual: number;
  stockMinimo: number | null;
  /** En una preparación es el costo calculado con sus ingredientes, no uno guardado. */
  costoUnitario: number | null;
  activo: boolean;
  /** Preparación propia (salsa, masa…): se arma con otros insumos y no lleva stock propio. */
  esElaborado: boolean;
  rindeTanda: number | null;
  ingredientes: IngredienteDatos[];
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

  // Una preparación no lleva stock propio: no hay nada que avisar. La regla es la misma de la lista y del reporte (src/lib/alerta-stock.ts).
  const estadoStock = estadoDeStock(insumo.stockActual, insumo.stockMinimo, insumo.esElaborado);
  const negativo = estadoStock === "negativo";
  const bajoMinimo = estadoStock === "bajo";

  // Lo que se está eligiendo para la unidad y el rendimiento: cambiar cualquiera de los dos NO convierte lo que ya está cargado (stock,
  // recetas, compras), y hay que avisarlo antes de que se guarde.
  const [unidadElegida, setUnidadElegida] = useState(insumo.unidadMedida);
  const [rendimientoEscrito, setRendimientoEscrito] = useState(String(insumo.rendimiento));
  useEffect(() => {
    setUnidadElegida(insumo.unidadMedida);
    setRendimientoEscrito(String(insumo.rendimiento));
  }, [insumo.unidadMedida, insumo.rendimiento]);
  const rendimientoNuevo = Number(rendimientoEscrito);
  const cambioUnidad = unidadElegida !== insumo.unidadMedida;
  const cambioRendimiento =
    !insumo.esElaborado && Number.isFinite(rendimientoNuevo) && rendimientoNuevo > 0 && Math.abs(rendimientoNuevo - insumo.rendimiento) > 0.0005;
  const avisosDeMedida: string[] = [];
  if (cambioUnidad) {
    avisosDeMedida.push(
      `La unidad pasa de «${etiquetaUnidadMedida(insumo.unidadMedida)}» a «${etiquetaUnidadMedida(unidadElegida)}»: cambia solo la etiqueta. El stock, las recetas y el historial siguen con los mismos números (5 ${etiquetaUnidadMedida(insumo.unidadMedida).toLowerCase()} pasan a ser 5 ${etiquetaUnidadMedida(unidadElegida).toLowerCase()}).`
    );
  }
  if (cambioRendimiento) {
    avisosDeMedida.push(
      `El rendimiento pasa de ${insumo.rendimiento} a ${rendimientoNuevo}: solo cuenta para las compras que cargues desde ahora. El stock que ya tenés y el costo por unidad ya guardado no se recalculan (el costo se corrige con la próxima compra).`
    );
  }

  function alGuardar(formData: FormData) {
    setError(null);
    if (avisosDeMedida.length > 0) {
      const seguir = confirm(
        `${avisosDeMedida.join("\n\n")}\n\nNada de lo que ya está cargado se convierte solo. ¿Guardar el cambio igual?`
      );
      if (!seguir) return;
      formData.set("confirmoCambioDeMedida", "1");
    }
    iniciar(async () => {
      const resultado = await llamarAlServidor(() => actualizarInsumo(insumo.id, formData));
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
    <Tarjeta className="!border-2 !border-azul/50 flex flex-col gap-4">
      <div>
        <h2 className="text-[1.1rem] font-semibold tracking-titular text-tinta">{insumo.nombre}</h2>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {insumo.esElaborado && <Pastilla color="azul">Preparación</Pastilla>}
          <Pastilla color={insumo.activo ? "exito" : "neutro"}>{insumo.activo ? "Activo" : "Desactivado"}</Pastilla>
          {negativo && <Pastilla color="peligro">Stock negativo</Pastilla>}
          {bajoMinimo && <Pastilla color="aviso">Bajo el mínimo</Pastilla>}
        </div>
      </div>

      <form onSubmit={alEnviar(alGuardar)} className="campos-grises flex flex-col gap-3">
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
            <Selector name="unidadMedida" defaultValue={insumo.unidadMedida} onChange={(e) => setUnidadElegida(e.target.value)}>
              {UNIDADES_MEDIDA.map((u) => (
                <option key={u.valor} value={u.valor}>
                  {u.etiqueta}
                </option>
              ))}
            </Selector>
          </Campo>
          {insumo.esElaborado ? (
            <Campo
              etiqueta="Rinde por tanda"
              ayuda="Cuánto sale de una tanda, en la unidad de medida elegida. Ej: si una tanda de salsa rinde 4 litros, poné 4."
            >
              <Entrada
                type="number"
                name="rindeTanda"
                step="0.001"
                min="0.001"
                required
                defaultValue={insumo.rindeTanda ?? ""}
              />
            </Campo>
          ) : (
            <>
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
                  onChange={(e) => setRendimientoEscrito(e.target.value)}
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
            </>
          )}
        </div>

        {avisosDeMedida.length > 0 && (
          <div role="alert" className="rounded-lg border border-aviso/30 bg-aviso-luz px-3 py-2 text-[0.82rem] text-tinta">
            <p className="font-semibold">Ojo: esto no convierte lo que ya está cargado</p>
            <ul className="mt-1 flex list-disc flex-col gap-1 pl-5">
              {avisosDeMedida.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </div>
        )}

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="activo" defaultChecked={insumo.activo} />
          Activo (disponible para armar recetas nuevas)
        </label>

        {error && <p className="text-sm font-medium text-peligro">{error}</p>}
        <div className="flex items-center gap-3">
          <button type="submit" disabled={pendiente} className={clasesBoton("navegar")}>
            {pendiente ? "Guardando…" : "Guardar cambios"}
          </button>
          {guardado && <span className="text-xs font-medium text-exito">✓ Guardado</span>}
        </div>
      </form>

      {insumo.esElaborado && (
        <div className="border-t border-linea pt-4">
          <RecetaElaborado
            elaboradoId={insumo.id}
            nombre={insumo.nombre}
            unidadMedida={etiquetaUnidadMedida(insumo.unidadMedida).toLowerCase()}
            rindeTanda={insumo.rindeTanda}
            ingredientes={insumo.ingredientes}
            costoPorUnidad={insumo.costoUnitario}
          />
        </div>
      )}
    </Tarjeta>
  );
}
