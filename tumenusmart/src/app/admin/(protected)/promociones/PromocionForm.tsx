"use client";

import { useMemo, useState, useTransition } from "react";
import { Campo, Entrada, Selector, Tarjeta, clasesBoton } from "@/components/ui";
import { Segmentado } from "@/components/Segmentado";
import { describirFranjaSola } from "@/lib/precio-promocion";
import {
  conflictoConOtras,
  etiquetaDePromo,
  formatoPorcentaje,
  validarPromocion,
  type DatosPromocion,
  type PromoDef,
} from "@/lib/promociones";
import { cambiarEstadoPromocion, duplicarPromocion, eliminarPromocion, guardarPromocion } from "./actions";
import { FranjasPromocion, filasDesde, franjasDe, type FilaDeDia } from "./FranjasPromocion";
import { SelectorDeProductos, type CategoriaConProductos } from "./SelectorDeProductos";

type Borrador = {
  nombre: string;
  tipo: "descuento" | "volumen";
  activa: boolean;
  porcentaje: string;
  porCada: string;
  regalar: string;
  forzarPorProducto: boolean;
  aplicaAModificadores: boolean;
  filas: FilaDeDia[];
  productIds: string[];
};

function borradorDesde(p: PromoDef | null): Borrador {
  if (!p) {
    return {
      nombre: "",
      tipo: "descuento",
      activa: true,
      porcentaje: "",
      porCada: "2",
      regalar: "1",
      forzarPorProducto: false,
      aplicaAModificadores: false,
      filas: filasDesde([]),
      productIds: [],
    };
  }
  return {
    nombre: p.nombre,
    tipo: p.tipo,
    activa: p.activa,
    porcentaje: p.porcentaje === null ? "" : formatoPorcentaje(p.porcentaje).replace(",", "."),
    porCada: p.porCada === null ? "2" : String(p.porCada),
    regalar: p.regalar === null ? "1" : String(p.regalar),
    forzarPorProducto: p.forzarPorProducto,
    aplicaAModificadores: p.aplicaAModificadores,
    filas: filasDesde(p.franjas),
    productIds: [...p.productIds],
  };
}

function datosDe(b: Borrador): DatosPromocion {
  return {
    nombre: b.nombre,
    tipo: b.tipo,
    activa: b.activa,
    porcentaje: b.porcentaje,
    porCada: b.porCada,
    regalar: b.regalar,
    forzarPorProducto: b.forzarPorProducto,
    aplicaAModificadores: b.aplicaAModificadores,
    franjas: franjasDe(b.filas),
    productIds: b.productIds,
  };
}

/**
 * El formulario de una promoción (la ventana "Promociones" de SoftRestaurant): el tipo (por descuento o por volumen), su nombre, el
 * descuento o el "por cada X, regalar Y", si alcanza a los agregados, si está activa, los días y horarios en que rige y los productos.
 * Lo que se escribe se revisa en el acto con las mismas reglas con que lo revisa el servidor al guardar.
 */
export function PromocionForm({
  inicial,
  todas,
  categorias,
  onGuardada,
  onCerrar,
  onEliminada,
  onDuplicada,
  onCambioDeEstado,
}: {
  inicial: PromoDef | null;
  todas: PromoDef[];
  categorias: CategoriaConProductos[];
  onGuardada: (id: string) => void;
  onCerrar: () => void;
  onEliminada: () => void;
  onDuplicada: (id: string) => void;
  onCambioDeEstado: () => void;
}) {
  const [pendiente, iniciar] = useTransition();
  const [b, setB] = useState<Borrador>(() => borradorDesde(inicial));
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);

  const nombreDeProducto = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const c of categorias) for (const p of c.productos) mapa.set(p.id, p.nombre);
    return (id: string) => mapa.get(id) ?? "un producto";
  }, [categorias]);

  function cambiar(cambios: Partial<Borrador>) {
    setError(null);
    setGuardado(false);
    setB((actual) => ({ ...actual, ...cambios }));
  }

  // Revisión en vivo: lo que falta o está mal, antes de apretar Guardar.
  const datos = useMemo(() => datosDe(b), [b]);
  const validacion = useMemo(() => validarPromocion(datos), [datos]);
  const conflicto = useMemo(
    () =>
      validacion.ok
        ? conflictoConOtras(
            { id: inicial?.id ?? "nueva", activa: validacion.promo.activa, franjas: validacion.promo.franjas, productIds: validacion.promo.productIds },
            todas,
            nombreDeProducto
          )
        : null,
    [validacion, todas, inicial, nombreDeProducto]
  );
  const problema = !validacion.ok ? validacion.error : conflicto;

  function guardar() {
    setError(null);
    if (problema) return;
    iniciar(async () => {
      const r = await guardarPromocion(inicial?.id ?? null, datos);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setGuardado(true);
      onGuardada(r.id);
    });
  }

  function eliminar() {
    if (!inicial) return;
    if (!confirm(`¿Eliminar la promoción “${inicial.nombre}”? Lo ya vendido no cambia.`)) return;
    setError(null);
    iniciar(async () => {
      const r = await eliminarPromocion(inicial.id);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onEliminada();
    });
  }

  function duplicar() {
    if (!inicial) return;
    setError(null);
    iniciar(async () => {
      const r = await duplicarPromocion(inicial.id);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onDuplicada(r.id);
    });
  }

  function alternarEstado() {
    if (!inicial) return;
    setError(null);
    iniciar(async () => {
      const r = await cambiarEstadoPromocion(inicial.id, !inicial.activa);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onCambioDeEstado();
    });
  }

  // El resumen "Así queda", en castellano.
  const resumen = validacion.ok
    ? (() => {
        const p = validacion.promo;
        const queHace =
          p.tipo === "descuento"
            ? `${formatoPorcentaje(p.porcentaje ?? 0)} % de descuento`
            : `por cada ${p.porCada}, se regalan ${p.regalar} (${etiquetaDePromo({ ...p, id: "x" })}); las unidades de cortesía son las más baratas`;
        return { queHace, franjas: p.franjas.map(describirFranjaSola), cantidad: p.productIds.length };
      })()
    : null;

  return (
    <Tarjeta className="!border-2 !border-azul/50 flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="break-words text-[1.1rem] font-semibold tracking-titular text-tinta">
            {inicial ? inicial.nombre : "Nueva promoción"}
          </h2>
          {inicial && (
            <p className="text-[0.8rem] text-tinta-suave">
              {inicial.activa ? "Activa: se aplica en todos los canales de venta." : "Inactiva: no se aplica en ningún canal."}
            </p>
          )}
        </div>
        <button type="button" onClick={onCerrar} disabled={pendiente} className={clasesBoton("peligro", "sm")}>
          Cerrar
        </button>
      </div>

      <div className="campos-grises flex flex-col gap-3">
        <div>
          <p className="mb-1.5 text-[0.82rem] font-medium text-tinta">Tipo</p>
          <Segmentado
            opciones={[
              { value: "descuento", label: "Por descuento" },
              { value: "volumen", label: "Por volumen" },
            ]}
            valor={b.tipo}
            onChange={(v) => cambiar({ tipo: v })}
            color="tinta"
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Campo etiqueta="Nombre" className="sm:col-span-2">
            <Entrada
              value={b.nombre}
              onChange={(e) => cambiar({ nombre: e.target.value })}
              maxLength={80}
              placeholder={b.tipo === "descuento" ? "Ej: PROMO 20 %" : "Ej: DOS POR UNA CERVEZA"}
            />
          </Campo>

          {b.tipo === "descuento" ? (
            <Campo etiqueta="Descuento (%)" ayuda="Mayor a 0 y menor a 100. Se aplica al precio de cada unidad.">
              <Entrada
                type="number"
                inputMode="decimal"
                min="0.01"
                max="99.99"
                step="0.01"
                value={b.porcentaje}
                onChange={(e) => cambiar({ porcentaje: e.target.value })}
                onWheel={(e) => e.currentTarget.blur()}
                placeholder="20"
              />
            </Campo>
          ) : (
            <>
              <Campo etiqueta="Por cada" ayuda="Cuántas unidades (de 2 a 20) hacen falta para que se regale.">
                <Entrada
                  type="number"
                  inputMode="numeric"
                  min="2"
                  max="20"
                  step="1"
                  value={b.porCada}
                  onChange={(e) => cambiar({ porCada: e.target.value })}
                  onWheel={(e) => e.currentTarget.blur()}
                />
              </Campo>
              <Campo etiqueta="Regalar" ayuda="Cuántas se regalan (menos que “por cada”). 2 y 1 es un 2x1; 3 y 1, un 3x2.">
                <Entrada
                  type="number"
                  inputMode="numeric"
                  min="1"
                  max="19"
                  step="1"
                  value={b.regalar}
                  onChange={(e) => cambiar({ regalar: e.target.value })}
                  onWheel={(e) => e.currentTarget.blur()}
                />
              </Campo>
            </>
          )}

          <Campo etiqueta="Estatus">
            <Selector value={b.activa ? "activa" : "inactiva"} onChange={(e) => cambiar({ activa: e.target.value === "activa" })}>
              <option value="activa">ACTIVA</option>
              <option value="inactiva">INACTIVA</option>
            </Selector>
          </Campo>
        </div>

        <div className="flex flex-col gap-2">
          <label className="flex items-start gap-2 text-[0.85rem] text-tinta">
            <input
              type="checkbox"
              checked={b.aplicaAModificadores}
              onChange={(e) => cambiar({ aplicaAModificadores: e.target.checked })}
              className="mt-0.5 h-4 w-4 accent-azul"
            />
            <span>
              <span className="font-medium">Aplicar promoción a modificadores</span>
              <span className="block text-[0.78rem] text-tinta-suave">
                {b.tipo === "descuento"
                  ? "Si está tildado, el descuento alcanza también a los agregados del producto; si no, los agregados se cobran completos."
                  : "Si está tildado, la unidad de cortesía sale con todo (agregados incluidos); si no, los agregados de la unidad regalada se cobran."}
              </span>
            </span>
          </label>
          {b.tipo === "volumen" && (
            <label className="flex items-start gap-2 text-[0.85rem] text-tinta">
              <input
                type="checkbox"
                checked={b.forzarPorProducto}
                onChange={(e) => cambiar({ forzarPorProducto: e.target.checked })}
                className="mt-0.5 h-4 w-4 accent-azul"
              />
              <span>
                <span className="font-medium">Forzar promoción por producto</span>
                <span className="block text-[0.78rem] text-tinta-suave">
                  Si está tildado, cada producto cuenta por separado: hacen falta 2 del MISMO producto (una Brahma y una Heineken no se suman). Si no,
                  todos los productos de la promoción se suman y las unidades de cortesía son las más baratas.
                </span>
              </span>
            </label>
          )}
        </div>
      </div>

      <div className="border-t border-linea pt-4">
        <FranjasPromocion filas={b.filas} onChange={(filas) => cambiar({ filas })} />
      </div>

      <div className="border-t border-linea pt-4">
        <SelectorDeProductos categorias={categorias} seleccion={b.productIds} onChange={(ids) => cambiar({ productIds: ids })} nombreDeCategoriaSeleccionada />
      </div>

      {resumen && !problema && (
        <div className="rounded-lg border border-exito/30 bg-exito-luz px-3 py-2.5">
          <p className="mb-1 text-[0.8rem] font-semibold text-exito">Así queda:</p>
          <p className="text-[0.84rem] text-tinta">
            <strong>{b.nombre.trim()}</strong>: {resumen.queHace}, para {resumen.cantidad} {resumen.cantidad === 1 ? "producto" : "productos"}.
          </p>
          <ul className="mt-1 flex flex-col gap-0.5 text-[0.82rem] text-tinta-media">
            {resumen.franjas.map((f) => (
              <li key={f}>• {f}</li>
            ))}
          </ul>
        </div>
      )}
      {problema && (
        <p role="alert" className="rounded-lg border border-aviso/30 bg-aviso-luz px-3 py-2.5 text-[0.84rem] font-medium text-aviso">
          Para guardar: {problema}
        </p>
      )}
      {error && (
        <p role="alert" className="text-[0.85rem] font-medium text-peligro">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-linea pt-4">
        <button type="button" disabled={pendiente || !!problema} onClick={guardar} className={`${clasesBoton("navegar")} disabled:opacity-50`}>
          {pendiente ? "Guardando…" : "Guardar"}
        </button>
        {guardado && <span className="text-xs font-medium text-exito">✓ Guardada</span>}
        {inicial && (
          <>
            <button type="button" disabled={pendiente} onClick={duplicar} className={clasesBoton("suave")}>
              Copiar promoción
            </button>
            <button type="button" disabled={pendiente} onClick={alternarEstado} className={clasesBoton("suave")}>
              {inicial.activa ? "Desactivar" : "Activar"}
            </button>
            <button type="button" disabled={pendiente} onClick={eliminar} className={`ml-auto ${clasesBoton("peligro")}`}>
              Eliminar
            </button>
          </>
        )}
      </div>
    </Tarjeta>
  );
}
