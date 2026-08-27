import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { crearCategoria } from "./actions";
import { CategoriaFila } from "./CategoriaFila";
import { sesionActual } from "@/lib/auth";
import { puede } from "@/lib/permisos";
import { clasesBoton } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AdminCategoriasPage() {
  // El empleado ve las categorías para entender la carta, pero no las toca.
  const sesion = await sesionActual();
  const puedeEditar = puede(sesion?.rol, "categorias.editar");

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
      <h1 className="mb-1 text-[1.4rem] font-semibold tracking-titular text-tinta">Categorías</h1>
      <p className="mb-6 text-sm text-tinta-media">
        El orden de esta lista es el orden en que las ve tu cliente en la carta.
        Movelas con las flechas.
      </p>

      {puedeEditar && (
      <form action={crearCategoria} className="mb-6 flex gap-2">
        <input
          name="nombre"
          required
          placeholder="Nueva categoría (ej: Postres)"
          className="flex-1 rounded-lg border border-linea px-3 py-2"
        />
        <button
          type="submit"
          className={clasesBoton("principal")}
        >
          Agregar
        </button>
      </form>
      )}

      <div className="flex flex-col gap-2">
        {categorias.map((c, i) => (
          <CategoriaFila
            key={c.id}
            id={c.id}
            nombre={c.nombre}
            activa={c.activa}
            cantidadProductos={c._count.productos}
            puedeEditar={puedeEditar}
            esPrimera={i === 0}
            esUltima={i === categorias.length - 1}
          />
        ))}
      </div>
    </div>
  );
}
