"use client";

import { useTransition } from "react";
import { clasesBoton } from "@/components/ui";
import { crearProducto } from "./actions";
import { ImagenProductoField } from "./ImagenProductoField";
import { IngredientesField } from "./IngredientesField";

type Categoria = { id: string; nombre: string };

export function CrearProductoForm({
  categorias,
  categoriaActivaId,
}: {
  categorias: Categoria[];
  categoriaActivaId?: string;
}) {
  const [pendiente, iniciar] = useTransition();

  function alCrear(formData: FormData) {
    iniciar(async () => {
      // Si sale bien, crearProducto redirige sola — este código no sigue.
      const resultado = await crearProducto(formData);
      if (resultado && !resultado.ok) alert(resultado.error);
    });
  }

  return (
    <form action={alCrear} className="mt-4 flex flex-col gap-3">
      <input
        name="nombre"
        required
        placeholder="Nombre"
        className="rounded-lg border border-linea px-3 py-2"
      />
      <textarea
        name="descripcion"
        placeholder="Descripción (opcional)"
        className="rounded-lg border border-linea px-3 py-2"
        rows={2}
      />
      <select
        name="categoryId"
        required
        defaultValue={categoriaActivaId ?? ""}
        className="rounded-lg border border-linea px-3 py-2"
      >
        <option value="" disabled>
          Elegí una categoría
        </option>
        {categorias.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre}
          </option>
        ))}
      </select>
      <input
        type="number"
        name="precio"
        required
        step="1"
        min="0"
        placeholder="Precio (Gs.)"
        className="rounded-lg border border-linea px-3 py-2"
      />
      <ImagenProductoField initialUrl={null} />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="disponible" defaultChecked />
        Disponible en el menú
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="destacado" />
        ⭐ Producto destacado (aparece en el carrusel de la cabecera del menú)
      </label>
      <IngredientesField initial={[]} />
      <button type="submit" disabled={pendiente} className={clasesBoton("principal")}>
        {pendiente ? "Creando…" : "Crear producto"}
      </button>
    </form>
  );
}
