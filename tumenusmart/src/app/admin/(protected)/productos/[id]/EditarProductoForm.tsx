"use client";

import { useTransition } from "react";
import { Tarjeta, Campo, Entrada, Area, Selector, clasesBoton } from "@/components/ui";
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
  imagenUrl: string | null;
  disponible: boolean;
  destacado: boolean;
  ingredientes: string[];
  mitadYMitadGrupo: string | null;
  mitadYMitadModo: string;
};

/**
 * Un formulario largo con una sola columna de campos sueltos se leía como un
 * bloque único: nada distinguía "esto es sobre el precio" de "esto es sobre
 * cómo se ve en la carta". Se agrupa en tarjetas con rótulo, el mismo
 * lenguaje visual que ya usan el checkout público y el formulario de
 * reservas — así cada sección se identifica de un vistazo en vez de haber
 * que leer todo para encontrar un campo puntual.
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
    <form action={alGuardar} className="campos-grises flex flex-col gap-4">
      <Tarjeta className="flex flex-col gap-3">
        <p className="rotulo text-[0.8rem] font-bold">Datos básicos</p>
        {/*
          Dos columnas desde sm: en una pantalla de escritorio, ocho campos
          en una sola columna obligaban a scrollear de más para ver todo el
          formulario. Descripción y Área de impresión ocupan las dos
          columnas igual (col-span-2): son las que necesitan más ancho para
          leerse cómodas (un textarea, una ayuda larga).
        */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Campo etiqueta="Categoría">
            <Selector name="categoryId" required defaultValue={producto.categoryId}>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </Selector>
          </Campo>
          <Campo etiqueta="Nombre">
            <Entrada name="nombre" required defaultValue={producto.nombre} />
          </Campo>
          <Campo etiqueta="Descripción (opcional)" className="sm:col-span-2">
            <Area name="descripcion" rows={2} defaultValue={producto.descripcion ?? ""} />
          </Campo>
          <Campo
            etiqueta="Área de impresión"
            ayuda="A dónde se manda este producto en la comanda automática. Sin área, no imprime en ninguna comanda."
            className={almacenes.length > 0 ? undefined : "sm:col-span-2"}
          >
            <Selector name="areaImpresionId" defaultValue={producto.areaImpresionId ?? ""}>
              <option value="">Sin área — no imprime en comanda</option>
              {areasImpresion.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nombre}
                </option>
              ))}
            </Selector>
          </Campo>
          {almacenes.length > 0 && (
            <Campo
              etiqueta="Almacén del que descuenta"
              ayuda="Cuando se vende este producto, su receta descuenta el stock de este almacén."
            >
              <Selector name="almacenId" defaultValue={producto.almacenId ?? almacenes[0].id}>
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

      <Tarjeta className="flex flex-col gap-3">
        <p className="rotulo text-[0.8rem] font-bold">Precio</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
            />
          </Campo>
          <Campo etiqueta="IVA" ayuda="Para el desglose de la Factura Autoimpresor.">
            <Selector name="iva" defaultValue={producto.iva}>
              {TASAS_IVA.map((t) => (
                <option key={t.valor} value={t.valor}>
                  {t.etiqueta}
                </option>
              ))}
            </Selector>
          </Campo>
          <Campo
            etiqueta="Unidad de medida"
            ayuda="Lo va a pedir la futura factura electrónica por cada producto."
          >
            <Selector name="unidadMedida" defaultValue={producto.unidadMedida}>
              {UNIDADES_MEDIDA.map((u) => (
                <option key={u.valor} value={u.valor}>
                  {u.etiqueta}
                </option>
              ))}
            </Selector>
          </Campo>
        </div>
      </Tarjeta>

      <Tarjeta className="flex flex-col gap-3">
        <p className="rotulo text-[0.8rem] font-bold">Foto</p>
        <ImagenProductoField initialUrl={producto.imagenUrl} />
      </Tarjeta>

      <Tarjeta className="flex flex-col gap-2">
        <p className="rotulo text-[0.8rem] font-bold">Visibilidad</p>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-x-6">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="disponible" defaultChecked={producto.disponible} />
            Disponible en el menú
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="destacado" defaultChecked={producto.destacado} />
            ⭐ Producto destacado (aparece en el carrusel de la cabecera del menú)
          </label>
        </div>
      </Tarjeta>

      <Tarjeta className="flex flex-col gap-3">
        <p className="rotulo text-[0.8rem] font-bold">Ingredientes</p>
        <IngredientesField initial={producto.ingredientes} />
      </Tarjeta>

      <Tarjeta className="flex flex-col gap-3">
        <p className="rotulo text-[0.8rem] font-bold">Mitad y mitad (opcional)</p>
        <p className="text-xs text-tinta-media">
          Escribí un nombre de grupo (ej: "Pizza Grande") para que el cliente pueda
          combinar este producto mitad y mitad con otros del MISMO grupo. Dejalo vacío
          si este producto no se combina.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Entrada
            name="mitadYMitadGrupo"
            defaultValue={producto.mitadYMitadGrupo ?? ""}
            placeholder="Ej: Pizza Grande"
          />
          <Selector name="mitadYMitadModo" defaultValue={producto.mitadYMitadModo}>
            <option value="mayor">Precio mayor (cobra el sabor más caro)</option>
            <option value="proporcional">Precio proporcional (mitad de cada uno)</option>
          </Selector>
        </div>
        <p className="text-xs text-tinta-suave">
          Usá el mismo modo en todos los productos de un mismo grupo.
        </p>
      </Tarjeta>

      <button type="submit" disabled={pendiente} className={clasesBoton("principal")}>
        {pendiente ? "Guardando…" : "Guardar cambios"}
      </button>
    </form>
  );
}
