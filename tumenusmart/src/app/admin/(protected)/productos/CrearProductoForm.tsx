"use client";

import { useTransition } from "react";
import { clasesBoton } from "@/components/ui";
import { crearProducto } from "./actions";
import { ImagenProductoField } from "./ImagenProductoField";
import { IngredientesField } from "./IngredientesField";

type Categoria = { id: string; nombre: string };
type AreaImpresion = { id: string; nombre: string };
type Almacen = { id: string; nombre: string };

export function CrearProductoForm({
  categorias,
  categoriaActivaId,
  areasImpresion,
  almacenes,
}: {
  categorias: Categoria[];
  categoriaActivaId?: string;
  areasImpresion: AreaImpresion[];
  /** Solo los activos, el más antiguo primero (queda elegido de entrada). */
  almacenes: Almacen[];
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
    <form action={alCrear} className="campos-grises mt-4 flex flex-col gap-3">
      {/* Dos columnas desde sm: menos scroll para llegar al botón de crear. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input
          name="nombre"
          required
          placeholder="Nombre"
          className="rounded-lg border border-linea px-3 py-2"
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
        <textarea
          name="descripcion"
          placeholder="Descripción (opcional)"
          className="rounded-lg border border-linea px-3 py-2 sm:col-span-2"
          rows={2}
        />
        <select
          name="areaImpresionId"
          defaultValue=""
          className="rounded-lg border border-linea px-3 py-2"
        >
          <option value="">Sin área — no imprime en comanda</option>
          {areasImpresion.map((a) => (
            <option key={a.id} value={a.id}>
              {a.nombre}
            </option>
          ))}
        </select>
        {almacenes.length > 0 && (
          <select
            name="almacenId"
            defaultValue={almacenes[0].id}
            title="Almacén del que descuenta el stock cuando se vende"
            className="rounded-lg border border-linea px-3 py-2"
          >
            {almacenes.map((a) => (
              <option key={a.id} value={a.id}>
                Descuenta de: {a.nombre}
              </option>
            ))}
          </select>
        )}
        <input
          type="number"
          name="precio"
          required
          step="1"
          min="0"
          placeholder="Precio (Gs.)"
          // Si el mouse queda encima mientras se scrollea la página, el
          // navegador le resta/suma al precio por cada "click" de la rueda,
          // sin avisar — sacarle el foco antes evita que eso pase.
          onWheel={(e) => e.currentTarget.blur()}
          className="rounded-lg border border-linea px-3 py-2"
        />
      </div>
      <ImagenProductoField initialUrl={null} />
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-x-6">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="disponible" defaultChecked />
          Disponible en el menú
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="destacado" />
          ⭐ Producto destacado (aparece en el carrusel de la cabecera del menú)
        </label>
      </div>
      <IngredientesField initial={[]} />
      <button type="submit" disabled={pendiente} className={clasesBoton("principal")}>
        {pendiente ? "Creando…" : "Crear producto"}
      </button>
    </form>
  );
}
