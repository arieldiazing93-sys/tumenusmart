"use client";

import { useTransition } from "react";
import { clasesBoton } from "@/components/ui";
import { actualizarProducto } from "../actions";
import { ImagenProductoField } from "../ImagenProductoField";
import { IngredientesField } from "../IngredientesField";

type Categoria = { id: string; nombre: string };
type Producto = {
  id: string;
  nombre: string;
  descripcion: string | null;
  categoryId: string;
  precio: number;
  costo: number | null;
  imagenUrl: string | null;
  disponible: boolean;
  destacado: boolean;
  ingredientes: string[];
  mitadYMitadGrupo: string | null;
  mitadYMitadModo: string;
};

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
    <form action={alGuardar} className="flex flex-col gap-3">
      <input
        name="nombre"
        required
        defaultValue={producto.nombre}
        className="rounded-lg border border-linea px-3 py-2"
      />
      <textarea
        name="descripcion"
        defaultValue={producto.descripcion ?? ""}
        rows={2}
        className="rounded-lg border border-linea px-3 py-2"
      />
      <select
        name="categoryId"
        required
        defaultValue={producto.categoryId}
        className="rounded-lg border border-linea px-3 py-2"
      >
        {categorias.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre}
          </option>
        ))}
      </select>
      <label className="flex flex-col gap-1 text-sm text-tinta-media">
        Precio de venta
        <input
          type="number"
          name="precio"
          required
          step="1"
          min="0"
          defaultValue={producto.precio}
          className="rounded-lg border border-linea px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-tinta-media">
        Costo (opcional)
        <input
          type="number"
          name="costo"
          step="1"
          min="0"
          placeholder="Lo que te cuesta prepararlo"
          defaultValue={producto.costo != null ? producto.costo : ""}
          className="rounded-lg border border-linea px-3 py-2"
        />
        <span className="text-xs text-tinta-suave">
          Solo lo ves vos. Con esto, Ideas para vender más puede decirte qué producto
          te deja más ganancia, no solo cuál factura más.
        </span>
      </label>
      <ImagenProductoField initialUrl={producto.imagenUrl} />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="disponible" defaultChecked={producto.disponible} />
        Disponible en el menú
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="destacado" defaultChecked={producto.destacado} />
        ⭐ Producto destacado (aparece en el carrusel de la cabecera del menú)
      </label>
      <IngredientesField initial={producto.ingredientes} />

      <div className="rounded-lg border border-linea p-3">
        <label className="mb-1 block text-sm font-medium text-tinta-media">
          Grupo "mitad y mitad" (opcional)
        </label>
        <p className="mb-2 text-xs text-tinta-media">
          Escribí un nombre de grupo (ej: "Pizza Grande") para que el cliente pueda
          combinar este producto mitad y mitad con otros del MISMO grupo. Dejalo vacío
          si este producto no se combina.
        </p>
        <input
          name="mitadYMitadGrupo"
          defaultValue={producto.mitadYMitadGrupo ?? ""}
          placeholder="Ej: Pizza Grande"
          className="mb-2 w-full rounded-lg border border-linea px-3 py-2 text-sm"
        />
        <select
          name="mitadYMitadModo"
          defaultValue={producto.mitadYMitadModo}
          className="w-full rounded-lg border border-linea px-3 py-2 text-sm"
        >
          <option value="mayor">Precio mayor (cobra el sabor más caro)</option>
          <option value="proporcional">Precio proporcional (mitad de cada uno)</option>
        </select>
        <p className="mt-1 text-xs text-tinta-suave">
          Usá el mismo modo en todos los productos de un mismo grupo.
        </p>
      </div>

      <button type="submit" disabled={pendiente} className={clasesBoton("principal")}>
        {pendiente ? "Guardando…" : "Guardar cambios"}
      </button>
    </form>
  );
}
