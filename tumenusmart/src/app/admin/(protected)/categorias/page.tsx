import { prisma } from "@/lib/prisma";
import { crearCategoria } from "./actions";
import { EliminarCategoriaBoton } from "./EliminarBoton";

export const dynamic = "force-dynamic";

export default async function AdminCategoriasPage() {
  const categorias = await prisma.category.findMany({
    orderBy: { orden: "asc" },
    include: { _count: { select: { productos: true } } },
  });

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-neutral-900">Categorías</h1>

      <form action={crearCategoria} className="mb-6 flex gap-2">
        <input
          name="nombre"
          required
          placeholder="Nueva categoría (ej: Postres)"
          className="flex-1 rounded-lg border border-neutral-300 px-3 py-2"
        />
        <button
          type="submit"
          className="rounded-lg bg-brand px-4 py-2 font-medium text-white hover:bg-brand-dark"
        >
          Agregar
        </button>
      </form>

      <div className="flex flex-col gap-2">
        {categorias.map((c) => (
          <div
            key={c.id}
            className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white px-4 py-3"
          >
            <span className="font-medium">{c.nombre}</span>
            <div className="flex items-center gap-4">
              <span className="text-sm text-neutral-500">
                {c._count.productos} producto(s)
              </span>
              <EliminarCategoriaBoton id={c.id} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
