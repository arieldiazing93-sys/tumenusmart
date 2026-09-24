"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Tarjeta, Campo, Entrada, Selector, clasesBoton } from "@/components/ui";
import { UNIDADES_MEDIDA } from "@/lib/unidad-medida";
import { TASAS_IVA } from "@/lib/iva";
import { crearInsumo } from "./actions";

type Categoria = { id: string; nombre: string };
type Almacen = { id: string; nombre: string };

export function CrearInsumoForm({
  categorias,
  almacenes,
  categoriaInicialId,
  esPreparacion = false,
  onCreado,
}: {
  categorias: Categoria[];
  /** Solo los activos. El stock inicial queda en el que se elija acá. */
  almacenes: Almacen[];
  /** Categoría que ya está elegida en la lista — el insumo nuevo arranca en ella. */
  categoriaInicialId?: string;
  /**
   * Una preparación (salsa, masa…) no se compra ni lleva stock: se arma con
   * otros insumos, así que en vez de compra/stock/costo se pide cuánto rinde
   * una tanda. Los ingredientes se cargan después, en el panel que se abre.
   */
  esPreparacion?: boolean;
  /** Se llama con el id del insumo recién creado, para abrirlo en el panel. */
  onCreado?: (insumoId: string) => void;
}) {
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
      onCreado?.(resultado.insumoId);
      setTimeout(() => setAgregado(false), 2500);
    });
  }

  return (
    <Tarjeta className="flex flex-col gap-3">
      <div>
        <p className="rotulo text-[0.8rem] font-bold">{esPreparacion ? "Nueva preparación" : "Nuevo insumo"}</p>
        {esPreparacion && (
          <p className="mt-1 text-[0.82rem] text-tinta-media">
            Una salsa, una masa, un aderezo: algo que preparás con otros insumos. No se compra ni lleva stock propio;
            al venderla, se descuentan los insumos con que se hace. Los ingredientes los cargás en el panel que se abre
            al crearla.
          </p>
        )}
      </div>
      <form ref={formRef} action={alCrear} className="campos-grises grid grid-cols-1 gap-3 sm:grid-cols-2">
        {esPreparacion && <input type="hidden" name="esElaborado" value="on" />}

        <Campo etiqueta="Nombre">
          <Entrada
            name="nombre"
            required
            placeholder={esPreparacion ? "Ej: Salsa de tomate" : "Ej: Carne molida"}
          />
        </Campo>

        <div>
          <Campo etiqueta="Categoría (opcional)">
            {!nuevaCategoria ? (
              <Selector name="categoriaId" defaultValue={categoriaInicialId ?? ""}>
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
          <Selector name="unidadMedida" defaultValue={esPreparacion ? "kilogramo" : "unidad"}>
            {UNIDADES_MEDIDA.map((u) => (
              <option key={u.valor} value={u.valor}>
                {u.etiqueta}
              </option>
            ))}
          </Selector>
        </Campo>

        {esPreparacion ? (
          <Campo
            etiqueta="Rinde por tanda"
            ayuda="Cuánto sale de una tanda, en la unidad elegida. Ej: si una tanda de salsa rinde 4 litros, poné 4."
          >
            <Entrada type="number" name="rindeTanda" step="0.001" min="0.001" required />
          </Campo>
        ) : (
          <>
            <Campo etiqueta="IVA" ayuda="Para armar la factura cuando se compra este insumo.">
              <Selector name="iva" defaultValue="gravado10">
                {TASAS_IVA.map((t) => (
                  <option key={t.valor} value={t.valor}>
                    {t.etiqueta}
                  </option>
                ))}
              </Selector>
            </Campo>
            <Campo etiqueta="Rendimiento" ayuda="Unidades que trae cada compra. Ej: un pack de 12 latas → 12.">
              <Entrada type="number" name="rendimiento" step="0.001" min="0.001" defaultValue={1} />
            </Campo>
            <Campo etiqueta="Stock inicial">
              <Entrada type="number" name="stockInicial" step="0.001" min="0" placeholder="0" />
            </Campo>
            <Campo etiqueta="Almacén" ayuda="Dónde queda el stock inicial.">
              <Selector name="almacenId" defaultValue={almacenes[0]?.id ?? ""}>
                {almacenes.length === 0 && <option value="">Primero creá un almacén</option>}
                {almacenes.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nombre}
                  </option>
                ))}
              </Selector>
            </Campo>
            <Campo etiqueta="Stock mínimo (opcional)" ayuda="Para avisar cuando conviene reponer.">
              <Entrada type="number" name="stockMinimo" step="0.001" min="0" />
            </Campo>
            <Campo etiqueta="Costo unitario (opcional)">
              <Entrada type="number" name="costoUnitario" step="1" min="0" placeholder="Gs." />
            </Campo>
          </>
        )}

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
