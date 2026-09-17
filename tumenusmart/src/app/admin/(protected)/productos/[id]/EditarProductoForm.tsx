"use client";

import { useTransition } from "react";
import { Tarjeta, Campo, Entrada, Area, Selector, clasesBoton } from "@/components/ui";
import { actualizarProducto } from "../actions";
import { ImagenProductoField } from "../ImagenProductoField";
import { IngredientesField } from "../IngredientesField";
import { TASAS_IVA } from "@/lib/iva";

type Categoria = { id: string; nombre: string };
type Producto = {
  id: string;
  nombre: string;
  descripcion: string | null;
  categoryId: string;
  precio: number;
  costo: number | null;
  iva: string;
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
}: {
  producto: Producto;
  categorias: Categoria[];
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
    <form action={alGuardar} className="flex flex-col gap-4">
      <Tarjeta className="flex flex-col gap-3">
        <p className="rotulo text-[0.8rem] font-bold">Datos básicos</p>
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
        <Campo etiqueta="Descripción (opcional)">
          <Area name="descripcion" rows={2} defaultValue={producto.descripcion ?? ""} />
        </Campo>
      </Tarjeta>

      <Tarjeta className="flex flex-col gap-3">
        <p className="rotulo text-[0.8rem] font-bold">Precio y costo</p>
        <Campo etiqueta="Precio de venta">
          <Entrada
            type="number"
            name="precio"
            required
            step="1"
            min="0"
            defaultValue={producto.precio}
          />
        </Campo>
        <Campo
          etiqueta="Costo (opcional)"
          ayuda="Solo lo ves vos. Con esto, Ideas para vender más puede decirte qué producto te deja más ganancia, no solo cuál factura más."
        >
          <Entrada
            type="number"
            name="costo"
            step="1"
            min="0"
            placeholder="Lo que te cuesta prepararlo"
            defaultValue={producto.costo != null ? producto.costo : ""}
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
      </Tarjeta>

      <Tarjeta className="flex flex-col gap-3">
        <p className="rotulo text-[0.8rem] font-bold">Foto</p>
        <ImagenProductoField initialUrl={producto.imagenUrl} />
      </Tarjeta>

      <Tarjeta className="flex flex-col gap-2">
        <p className="rotulo text-[0.8rem] font-bold">Visibilidad</p>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="disponible" defaultChecked={producto.disponible} />
          Disponible en el menú
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="destacado" defaultChecked={producto.destacado} />
          ⭐ Producto destacado (aparece en el carrusel de la cabecera del menú)
        </label>
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
        <Entrada
          name="mitadYMitadGrupo"
          defaultValue={producto.mitadYMitadGrupo ?? ""}
          placeholder="Ej: Pizza Grande"
        />
        <Selector name="mitadYMitadModo" defaultValue={producto.mitadYMitadModo}>
          <option value="mayor">Precio mayor (cobra el sabor más caro)</option>
          <option value="proporcional">Precio proporcional (mitad de cada uno)</option>
        </Selector>
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
