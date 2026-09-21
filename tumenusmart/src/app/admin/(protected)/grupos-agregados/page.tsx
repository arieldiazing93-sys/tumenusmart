import { pantallaConPermiso } from "@/lib/auth";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { Cabecera } from "@/components/ui";
import { CrearGrupoForm } from "./CrearGrupoForm";
import { GrupoFila } from "./GrupoFila";
import { moverGrupo } from "./actions";

export const dynamic = "force-dynamic";

/**
 * Grupos de agregados reutilizables (ej. "Salsas", "Quesos") — un grupo se
 * adjunta a varios productos a la vez desde la tarjeta "Grupos de
 * agregados" de cada producto. Cada modificador del grupo es un Producto
 * real del catálogo (ver OptionGroupProduct), así que corregir su precio
 * en /admin/productos lo corrige en todos los productos que lo usan, sin
 * recargarlo a mano en cada uno. A diferencia de los agregados propios de
 * un producto (ProductOption, gestionados en /admin/productos/[id]), esto
 * es un catálogo aparte.
 */
export default async function GruposAgregadosPage() {
  await pantallaConPermiso("productos.editar");
  const prisma = prismaDelLocal(await idLocalActual());

  const grupos = await prisma.optionGroup.findMany({
    orderBy: [{ orden: "asc" }, { createdAt: "asc" }],
    include: { _count: { select: { modificadores: true, productos: true } } },
  });

  return (
    <div>
      <Cabecera
        titulo="Grupos de agregados"
        bajada="Un grupo con nombre (ej. Salsas, Quesos) que se adjunta a varios productos a la vez. Cada modificador es un producto real de tu catálogo (creálo primero en Productos)."
      />

      <CrearGrupoForm />

      <div className="flex flex-col gap-2">
        {grupos.map((g, i) => (
          <GrupoFila
            key={g.id}
            id={g.id}
            nombre={g.nombre}
            cantidadModificadores={g._count.modificadores}
            cantidadProductos={g._count.productos}
            esPrimero={i === 0}
            esUltimo={i === grupos.length - 1}
            moverGrupo={moverGrupo}
          />
        ))}
        {grupos.length === 0 && (
          <p className="text-sm text-tinta-suave">Todavía no hay grupos de agregados creados.</p>
        )}
      </div>
    </div>
  );
}
