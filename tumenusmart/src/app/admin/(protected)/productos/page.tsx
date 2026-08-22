import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatearGuarani } from "@/lib/format";
import { crearProducto } from "./actions";
import { IngredientesField } from "./IngredientesField";
import { ImagenProductoField } from "./ImagenProductoField";

export const dynamic = "force-dynamic";

export default async function AdminProductosPage({
  searchParams,
}: {
  searchParams: Promise<{ categoria?: string }>;
}) {
  const { categoria: categoriaId } = await searchParams;

  const categorias = await prisma.category.findMany({
    orderBy: { orden: "asc" },
    include: { _count: { select: { productos: true } } },
  });

  const categoriaActiva = categoriaId
    ? categorias.find((c) => c.id === categoriaId)
    : undefined;

  const productos = categoriaActiva
    ? await prisma.product.findMany({
        where: { categoryId: categoriaActiva.id },
        orderBy: { orden: "asc" },
      })
    : [];

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-neutral-900">Productos</h1>

      {categorias.length === 0 ? (
        <p className="mb-6 text-sm text-amber-700">
          Creá primero una categoría en la sección "Categorías" para poder cargar productos.
        </p>
      ) : (
        <>
          <div className="mb-6 flex flex-wrap gap-2">
            {categorias.map((c) => (
              <Link
                key={c.id}
                href={`/admin/productos?categoria=${c.id}`}
                className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
                  categoriaActiva?.id === c.id
                    ? "border-brand bg-brand text-white"
                    : "border-neutral-300 text-neutral-600 hover:border-brand hover:text-brand"
                }`}
              >
                {c.nombre}{" "}
                <span className={categoriaActiva?.id === c.id ? "opacity-80" : "text-neutral-400"}>
                  ({c._count.productos})
                </span>
              </Link>
            ))}
          </div>

          <details className="mb-6 rounded-lg border border-neutral-200 bg-white p-4">
            <summary className="cursor-pointer font-medium">
              + Nuevo producto
            </summary>
            <form action={crearProducto} className="mt-4 flex flex-col gap-3">
              <input
                name="nombre"
                required
                placeholder="Nombre"
                className="rounded-lg border border-neutral-300 px-3 py-2"
              />
              <textarea
                name="descripcion"
                placeholder="Descripción (opcional)"
                className="rounded-lg border border-neutral-300 px-3 py-2"
                rows={2}
              />
              <select
                name="categoryId"
                required
                defaultValue={categoriaActiva?.id ?? ""}
                className="rounded-lg border border-neutral-300 px-3 py-2"
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
                className="rounded-lg border border-neutral-300 px-3 py-2"
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
              <button
                type="submit"
                className="rounded-lg bg-brand px-4 py-2 font-medium text-white hover:bg-brand-dark"
              >
                Crear producto
              </button>
            </form>
          </details>
        </>
      )}

      {!categoriaActiva && categorias.length > 0 && (
        <p className="text-sm text-neutral-400">
          Elegí una categoría arriba para ver sus productos.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {productos.map((p) => (
          <Link
            key={p.id}
            href={`/admin/productos/${p.id}`}
            className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white px-4 py-3 hover:border-brand"
          >
            <p className="font-medium">
              {p.destacado && <span title="Destacado">⭐ </span>}
              {p.nombre}{" "}
              {!p.disponible && (
                <span className="text-xs text-neutral-400">(oculto)</span>
              )}
            </p>
            <span className="font-semibold">{formatearGuarani(Number(p.precio))}</span>
          </Link>
        ))}
        {categoriaActiva && productos.length === 0 && (
          <p className="text-sm text-neutral-400">
            Todavía no hay productos en "{categoriaActiva.nombre}".
          </p>
        )}
      </div>
    </div>
  );
}
