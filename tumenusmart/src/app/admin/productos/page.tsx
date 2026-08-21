import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatearGuarani } from "@/lib/format";
import { crearProducto } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminProductosPage() {
  const [productos, categorias] = await Promise.all([
    prisma.product.findMany({
      orderBy: [{ categoryId: "asc" }, { orden: "asc" }],
      include: { category: true },
    }),
    prisma.category.findMany({ orderBy: { orden: "asc" } }),
  ]);

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-neutral-900">Productos</h1>

      {categorias.length === 0 ? (
        <p className="mb-6 text-sm text-amber-700">
          Creá primero una categoría en la sección "Categorías" para poder cargar productos.
        </p>
      ) : (
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
              placeholder="Precio (Gs.)"
              className="rounded-lg border border-neutral-300 px-3 py-2"
            />
            <input
              name="imagenUrl"
              placeholder="URL de la foto (opcional)"
              className="rounded-lg border border-neutral-300 px-3 py-2"
            />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="disponible" defaultChecked />
              Disponible en el menú
            </label>
            <button
              type="submit"
              className="rounded-lg bg-brand px-4 py-2 font-medium text-white hover:bg-brand-dark"
            >
              Crear producto
            </button>
          </form>
        </details>
      )}

      <div className="flex flex-col gap-2">
        {productos.map((p) => (
          <Link
            key={p.id}
            href={`/admin/productos/${p.id}`}
            className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white px-4 py-3 hover:border-brand"
          >
            <div>
              <p className="font-medium">
                {p.nombre}{" "}
                {!p.disponible && (
                  <span className="text-xs text-neutral-400">(oculto)</span>
                )}
              </p>
              <p className="text-sm text-neutral-500">{p.category.nombre}</p>
            </div>
            <span className="font-semibold">{formatearGuarani(Number(p.precio))}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
