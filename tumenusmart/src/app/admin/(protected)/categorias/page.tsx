import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { crearCategoria } from "./actions";
import { CategoriaFila } from "./CategoriaFila";

export const dynamic = "force-dynamic";

export default async function AdminCategoriasPage() {
  // Todas las consultas de acá abajo quedan atadas a este local.
  const prisma = prismaDelLocal(await idLocalActual());

  const categorias = await prisma.category.findMany({
    // El desempate por createdAt importa: sin él, con órdenes repetidas la
    // lista podría salir en distinto orden en cada carga y las flechas
    // moverían la categoría equivocada.
    orderBy: [{ orden: "asc" }, { createdAt: "asc" }],
    include: { _count: { select: { productos: true } } },
  });

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold text-neutral-900">Categorías</h1>
      <p className="mb-6 text-sm text-neutral-500">
        El orden de esta lista es el orden en que las ve tu cliente en la carta.
        Movelas con las flechas.
      </p>

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
        {categorias.map((c, i) => (
          <CategoriaFila
            key={c.id}
            id={c.id}
            nombre={c.nombre}
            activa={c.activa}
            cantidadProductos={c._count.productos}
            esPrimera={i === 0}
            esUltima={i === categorias.length - 1}
          />
        ))}
      </div>
    </div>
  );
}
