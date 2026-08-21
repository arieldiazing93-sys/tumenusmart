import { prisma } from "@/lib/prisma";
import { crearCategoria, actualizarMitadYMitad } from "./actions";
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
            className="rounded-lg border border-neutral-200 bg-white px-4 py-3"
          >
            <div className="flex items-center justify-between">
              <span className="font-medium">{c.nombre}</span>
              <div className="flex items-center gap-4">
                <span className="text-sm text-neutral-500">
                  {c._count.productos} producto(s)
                </span>
                <EliminarCategoriaBoton id={c.id} />
              </div>
            </div>
            <form
              action={actualizarMitadYMitad.bind(null, c.id)}
              className="mt-2 flex flex-wrap items-center gap-3 border-t border-neutral-100 pt-2 text-sm"
            >
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="permiteMitadYMitad"
                  defaultChecked={c.permiteMitadYMitad}
                />
                Permitir "mitad y mitad" en esta categoría
              </label>
              <select
                name="modoPrecioMitad"
                defaultValue={c.modoPrecioMitad}
                className="rounded-lg border border-neutral-300 px-2 py-1"
              >
                <option value="mayor">Precio mayor (cobra el sabor más caro)</option>
                <option value="proporcional">Precio proporcional (mitad de cada uno)</option>
              </select>
              <button
                type="submit"
                className="rounded-lg bg-neutral-800 px-3 py-1 text-white hover:bg-neutral-700"
              >
                Guardar
              </button>
            </form>
          </div>
        ))}
      </div>
    </div>
  );
}
