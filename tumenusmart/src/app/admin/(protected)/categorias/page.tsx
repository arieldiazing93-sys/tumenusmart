import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { crearCategoria } from "./actions";
import { CategoriaFila } from "./CategoriaFila";

export const dynamic = "force-dynamic";

export default async function AdminCategoriasPage() {
  // Todas las consultas de acá abajo quedan atadas a este local.
  const prisma = prismaDelLocal(await idLocalActual());

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
          <CategoriaFila
            key={c.id}
            id={c.id}
            nombre={c.nombre}
            activa={c.activa}
            cantidadProductos={c._count.productos}
          />
        ))}
      </div>
    </div>
  );
}
