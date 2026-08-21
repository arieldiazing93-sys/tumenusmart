import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatearGuarani } from "@/lib/format";
import { actualizarProducto, agregarOpcion } from "../actions";
import { EliminarProductoBoton, EliminarOpcionBoton } from "./EliminarBotones";
import { IngredientesField } from "../IngredientesField";
import { ImagenProductoField } from "../ImagenProductoField";

export const dynamic = "force-dynamic";

export default async function EditarProductoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [producto, categorias] = await Promise.all([
    prisma.product.findUnique({
      where: { id },
      include: { opciones: { orderBy: { orden: "asc" } } },
    }),
    prisma.category.findMany({ orderBy: { orden: "asc" } }),
  ]);

  if (!producto) notFound();

  const guardarCambios = actualizarProducto.bind(null, producto.id);
  const guardarOpcion = agregarOpcion.bind(null, producto.id);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-neutral-900">{producto.nombre}</h1>
          <EliminarProductoBoton productId={producto.id} />
        </div>

        <form action={guardarCambios} className="flex flex-col gap-3">
          <input
            name="nombre"
            required
            defaultValue={producto.nombre}
            className="rounded-lg border border-neutral-300 px-3 py-2"
          />
          <textarea
            name="descripcion"
            defaultValue={producto.descripcion ?? ""}
            rows={2}
            className="rounded-lg border border-neutral-300 px-3 py-2"
          />
          <select
            name="categoryId"
            required
            defaultValue={producto.categoryId}
            className="rounded-lg border border-neutral-300 px-3 py-2"
          >
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
            defaultValue={Number(producto.precio)}
            className="rounded-lg border border-neutral-300 px-3 py-2"
          />
          <ImagenProductoField initialUrl={producto.imagenUrl} />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="disponible"
              defaultChecked={producto.disponible}
            />
            Disponible en el menú
          </label>
          <IngredientesField initial={producto.ingredientes} />
          <button
            type="submit"
            className="rounded-lg bg-brand px-4 py-2 font-medium text-white hover:bg-brand-dark"
          >
            Guardar cambios
          </button>
        </form>
      </div>

      <div>
        <h2 className="mb-3 font-semibold text-neutral-800">
          Variantes y agregados
        </h2>
        <p className="mb-3 text-sm text-neutral-500">
          Variante: el cliente elige una (ej. tamaño). Agregado: el cliente puede sumar varios (ej. extras).
        </p>

        <div className="mb-4 flex flex-col gap-2">
          {producto.opciones.map((o) => (
            <div
              key={o.id}
              className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm"
            >
              <span>
                {o.nombre}{" "}
                <span className="text-neutral-400">
                  ({o.tipo}
                  {Number(o.precioExtra) > 0
                    ? ` · +${formatearGuarani(Number(o.precioExtra))}`
                    : ""}
                  )
                </span>
              </span>
              <EliminarOpcionBoton productId={producto.id} optionId={o.id} />
            </div>
          ))}
          {producto.opciones.length === 0 && (
            <p className="text-sm text-neutral-400">Sin variantes ni agregados todavía.</p>
          )}
        </div>

        <form action={guardarOpcion} className="flex flex-wrap items-end gap-2">
          <input
            name="nombre"
            required
            placeholder="Nombre (ej: Grande, Extra queso)"
            className="min-w-[180px] flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm"
          />
          <select
            name="tipo"
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
          >
            <option value="variante">Variante</option>
            <option value="agregado">Agregado</option>
          </select>
          <input
            type="number"
            name="precioExtra"
            step="1"
            min="0"
            defaultValue={0}
            placeholder="Precio extra"
            className="w-32 rounded-lg border border-neutral-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded-lg bg-neutral-800 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
          >
            Agregar opción
          </button>
        </form>
      </div>
    </div>
  );
}
