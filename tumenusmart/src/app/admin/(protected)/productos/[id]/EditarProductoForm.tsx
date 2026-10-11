"use client";

import { useTransition } from "react";
import { Tarjeta, Campo, Entrada, Area, Selector, clasesBoton, CLASES_CAMPO_UBICACION } from "@/components/ui";
import { actualizarProducto } from "../actions";
import { ImagenProductoField } from "../ImagenProductoField";
import { IngredientesField } from "../IngredientesField";
import { TASAS_IVA } from "@/lib/iva";
import { UNIDADES_MEDIDA } from "@/lib/unidad-medida";

type Categoria = { id: string; nombre: string };
type AreaImpresion = { id: string; nombre: string };
type Almacen = { id: string; nombre: string; activo: boolean };
type Producto = {
  id: string;
  nombre: string;
  descripcion: string | null;
  categoryId: string;
  areaImpresionId: string | null;
  almacenId: string | null;
  precio: number;
  iva: string;
  unidadMedida: string;
  esServicio: boolean;
  imagenUrl: string | null;
  disponible: boolean;
  destacado: boolean;
  ingredientes: string[];
  mitadYMitadGrupo: string | null;
  mitadYMitadModo: string;
};

/** Campos más bajos que los comunes (el `!` le gana al relleno de siempre): la ficha entra con menos desplazamiento. */
const COMPACTO = "!py-1.5";

/**
 * Un formulario largo con una sola columna de campos sueltos se leía como un
 * bloque único: nada distinguía "esto es sobre el precio" de "esto es sobre
 * cómo se ve en la carta". Se agrupa en tarjetas con rótulo, el mismo
 * lenguaje visual que ya usan el checkout público y el formulario de
 * reservas — así cada sección se identifica de un vistazo en vez de haber
 * que leer todo para encontrar un campo puntual.
 *
 * Es COMPACTO a propósito (se abre en un panel al lado de la lista): tarjetas con menos relleno, campos más bajos, el
 * precio con su IVA y su unidad en una sola fila, la foto y la visibilidad lado a lado, y las ayudas en una línea.
 */
export function EditarProductoForm({
  producto,
  categorias,
  areasImpresion,
  almacenes,
}: {
  producto: Producto;
  categorias: Categoria[];
  areasImpresion: AreaImpresion[];
  /** Los activos, más el que ya tiene este producto aunque se haya desactivado; el más antiguo primero. */
  almacenes: Almacen[];
}) {
  const [pendiente, iniciar] = useTransition();

  function alGuardar(formData: FormData) {
    iniciar(async () => {
      // Si sale bien, actualizarProducto redirige sola — este código no sigue.
      const resultado = await actualizarProducto(producto.id, formData);
      if (resultado && !resultado.ok) alert(resultado.error);
    });
  }

  return (
    <form action={alGuardar} className="campos-grises flex flex-col gap-3">
      <Tarjeta className="flex flex-col gap-2 !p-3">
        <p className="rotulo text-[0.8rem] font-bold">Datos básicos</p>
        {/*
          Dos columnas desde sm: en una pantalla de escritorio, ocho campos
          en una sola columna obligaban a scrollear de más para ver todo el
          formulario. La descripción ocupa las dos columnas (es un textarea).
        */}
        <div className="grid grid-cols-1 gap-x-3 gap-y-2 sm:grid-cols-2">
          <Campo etiqueta="Categoría">
            <Selector
              name="categoryId"
              required
              defaultValue={producto.categoryId}
              className={`${CLASES_CAMPO_UBICACION} ${COMPACTO}`}
            >
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </Selector>
          </Campo>
          <Campo etiqueta="Nombre">
            <Entrada name="nombre" required defaultValue={producto.nombre} className={COMPACTO} />
          </Campo>
          <Campo etiqueta="Descripción (opcional)" className="sm:col-span-2">
            <Area name="descripcion" rows={2} defaultValue={producto.descripcion ?? ""} className={COMPACTO} />
          </Campo>
          <Campo
            etiqueta="Área de impresión"
            ayuda="A dónde sale en la comanda. Sin área, no imprime."
            className={almacenes.length > 0 ? undefined : "sm:col-span-2"}
          >
            <Selector name="areaImpresionId" defaultValue={producto.areaImpresionId ?? ""} className={COMPACTO}>
              <option value="">Sin área — no imprime en comanda</option>
              {areasImpresion.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nombre}
                </option>
              ))}
            </Selector>
          </Campo>
          {almacenes.length > 0 && (
            <Campo etiqueta="Almacén del que descuenta" ayuda="De dónde baja el stock de su receta al vender.">
              <Selector name="almacenId" defaultValue={producto.almacenId ?? almacenes[0].id} className={COMPACTO}>
                {almacenes.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nombre}
                    {a.activo ? "" : " (desactivado)"}
                  </option>
                ))}
              </Selector>
            </Campo>
          )}
        </div>
      </Tarjeta>

      <Tarjeta className="flex flex-col gap-2 !p-3">
        <p className="rotulo text-[0.8rem] font-bold">Precio</p>
        {/* Precio, IVA y unidad de medida en una sola fila (en el celular, una debajo de otra). */}
        <div className="grid grid-cols-1 gap-x-3 gap-y-2 sm:grid-cols-3">
          <Campo etiqueta="Precio de venta">
            {/* Guaraníes enteros: si el precio guardado trae decimales, el campo
                (que solo acepta enteros) rechazaría el guardado con "valor inválido". */}
            <Entrada
              type="number"
              name="precio"
              required
              step="1"
              min="0"
              defaultValue={Math.round(producto.precio)}
              className={COMPACTO}
            />
          </Campo>
          <Campo etiqueta="IVA">
            <Selector name="iva" defaultValue={producto.iva} className={COMPACTO}>
              {TASAS_IVA.map((t) => (
                <option key={t.valor} value={t.valor}>
                  {t.etiqueta}
                </option>
              ))}
            </Selector>
          </Campo>
          <Campo etiqueta="Unidad de medida">
            <Selector name="unidadMedida" defaultValue={producto.unidadMedida} className={COMPACTO}>
              {UNIDADES_MEDIDA.map((u) => (
                <option key={u.valor} value={u.valor}>
                  {u.etiqueta}
                </option>
              ))}
            </Selector>
          </Campo>
          <label className="flex items-start gap-2 text-[0.85rem] text-tinta sm:col-span-3">
            <input
              type="checkbox"
              name="esServicio"
              defaultChecked={producto.esServicio}
              className="mt-0.5 h-4 w-4 accent-brand"
            />
            <span>
              <span className="font-medium">Es un servicio</span>
              <span className="block text-[0.78rem] text-tinta-suave">
                Marcalo si no es una mercadería (corte de pelo, consulta). En la factura electrónica se declara como
                prestación de servicios.
              </span>
            </span>
          </label>
        </div>
      </Tarjeta>

      {/* La foto y la visibilidad lado a lado (en el celular, una debajo de otra). */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Tarjeta className="!p-3">
          <ImagenProductoField initialUrl={producto.imagenUrl} />
        </Tarjeta>

        <Tarjeta className="flex flex-col gap-2 !p-3">
          <p className="rotulo text-[0.8rem] font-bold">Visibilidad</p>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="disponible" defaultChecked={producto.disponible} />
              Disponible en el menú
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="destacado" defaultChecked={producto.destacado} className="mt-1" />
              <span>⭐ Destacado (aparece en el carrusel de la cabecera del menú)</span>
            </label>
          </div>
        </Tarjeta>
      </div>

      <Tarjeta className="!p-3">
        <IngredientesField initial={producto.ingredientes} />
      </Tarjeta>

      <Tarjeta className="flex flex-col gap-2 !p-3">
        <p className="rotulo text-[0.8rem] font-bold">Mitad y mitad (opcional)</p>
        <p className="text-xs text-tinta-media">
          Un nombre de grupo (ej: &quot;Pizza Grande&quot;) para que el cliente combine este producto mitad y mitad con otros
          del MISMO grupo; vacío, no se combina. Usá el mismo modo en todo el grupo.
        </p>
        <div className="grid grid-cols-1 gap-x-3 gap-y-2 sm:grid-cols-2">
          <Entrada
            name="mitadYMitadGrupo"
            defaultValue={producto.mitadYMitadGrupo ?? ""}
            placeholder="Ej: Pizza Grande"
            className={COMPACTO}
          />
          <Selector name="mitadYMitadModo" defaultValue={producto.mitadYMitadModo} className={COMPACTO}>
            <option value="mayor">Precio mayor (cobra el sabor más caro)</option>
            <option value="proporcional">Precio proporcional (mitad de cada uno)</option>
          </Selector>
        </div>
      </Tarjeta>

      <button type="submit" disabled={pendiente} className={clasesBoton("navegar")}>
        {pendiente ? "Guardando…" : "Guardar cambios"}
      </button>
    </form>
  );
}
