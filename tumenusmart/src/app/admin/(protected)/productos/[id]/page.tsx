import { clasesBoton } from "@/components/ui";
import { Suspense } from "react";
import { Volver } from "@/components/Volver";
import { notFound } from "next/navigation";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { formatearGuarani } from "@/lib/format";
import { actualizarProducto, agregarOpcion } from "../actions";
import { EliminarProductoBoton, EliminarOpcionBoton } from "./EliminarBotones";
import { IngredientesField } from "../IngredientesField";
import { ImagenProductoField } from "../ImagenProductoField";
import { GuardadoToast } from "@/components/GuardadoToast";

export const dynamic = "force-dynamic";

export default async function EditarProductoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Todas las consultas de acá abajo quedan atadas a este local.
  const prisma = prismaDelLocal(await idLocalActual());

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
      <Suspense fallback={null}>
        <GuardadoToast />
      </Suspense>

      <div>
        <div className="mb-4">
          <Volver
            href={`/admin/productos?categoria=${producto.categoryId}`}
            texto={`Volver a ${categorias.find((c) => c.id === producto.categoryId)?.nombre ?? "la categoría"}`}
          />
        </div>

        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-[1.4rem] font-semibold tracking-titular text-tinta">{producto.nombre}</h1>
          <EliminarProductoBoton productId={producto.id} />
        </div>

        <form action={guardarCambios} className="flex flex-col gap-3">
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
              defaultValue={Number(producto.precio)}
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
              defaultValue={producto.costo != null ? Number(producto.costo) : ""}
              className="rounded-lg border border-linea px-3 py-2"
            />
            <span className="text-xs text-tinta-suave">
              Solo lo ves vos. Con esto, Ideas para vender más puede decirte qué producto
              te deja más ganancia, no solo cuál factura más.
            </span>
          </label>
          <ImagenProductoField initialUrl={producto.imagenUrl} />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="disponible"
              defaultChecked={producto.disponible}
            />
            Disponible en el menú
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="destacado"
              defaultChecked={producto.destacado}
            />
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

          <button
            type="submit"
            className={clasesBoton("principal")}
          >
            Guardar cambios
          </button>
        </form>
      </div>

      <div>
        <h2 className="mb-3 font-semibold text-tinta">
          Agregados
        </h2>
        <p className="mb-3 text-sm text-tinta-media">
          Extras que el cliente puede sumar a este producto (ej: borde relleno, extra queso).
        </p>

        <div className="mb-4 flex flex-col gap-2">
          {producto.opciones.map((o) => (
            <div
              key={o.id}
              className="flex items-center justify-between rounded-lg border border-linea bg-white px-3 py-2 text-sm"
            >
              <span>
                {o.nombre}
                {Number(o.precioExtra) > 0 && (
                  <span className="text-tinta-suave">
                    {" "}
                    · +{formatearGuarani(Number(o.precioExtra))}
                  </span>
                )}
              </span>
              <EliminarOpcionBoton productId={producto.id} optionId={o.id} />
            </div>
          ))}
          {producto.opciones.length === 0 && (
            <p className="text-sm text-tinta-suave">Sin agregados todavía.</p>
          )}
        </div>

        <form action={guardarOpcion} className="flex flex-wrap items-end gap-2">
          <input
            name="nombre"
            required
            placeholder="Nombre (ej: Extra queso, Borde relleno)"
            className="min-w-[180px] flex-1 rounded-lg border border-linea px-3 py-2 text-sm"
          />
          <input
            type="number"
            name="precioExtra"
            step="1"
            min="0"
            defaultValue={0}
            placeholder="Precio extra"
            className="w-32 rounded-lg border border-linea px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded-lg bg-noche-panel px-4 py-2 text-sm font-medium text-white hover:bg-noche-panel"
          >
            Agregar
          </button>
        </form>
      </div>
    </div>
  );
}
