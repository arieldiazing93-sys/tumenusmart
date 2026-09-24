import { pantallaConPermiso } from "@/lib/auth";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { etiquetaUnidadMedida } from "@/lib/unidad-medida";
import { costoDeElaborado, mapaDeElaborados } from "@/lib/insumo-elaborado";
import { Cabecera } from "@/components/ui";
import { InsumosMaestroDetalle } from "./InsumosMaestroDetalle";

export const dynamic = "force-dynamic";

export default async function InsumosPage() {
  await pantallaConPermiso("stock.ver");
  const prisma = prismaDelLocal(await idLocalActual());

  const [insumos, categorias, almacenes] = await Promise.all([
    prisma.insumo.findMany({
      orderBy: [{ activo: "desc" }, { nombre: "asc" }],
      // Con qué se hace cada preparación (los insumos comunes no traen nada).
      include: {
        ingredientes: {
          orderBy: { ingrediente: { nombre: "asc" } },
          select: {
            ingredienteId: true,
            cantidad: true,
            ingrediente: { select: { nombre: true, unidadMedida: true, costoUnitario: true, esElaborado: true } },
          },
        },
      },
    }),
    prisma.categoriaInsumo.findMany({ orderBy: { nombre: "asc" } }),
    prisma.almacen.findMany({
      where: { activo: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, nombre: true },
    }),
  ]);

  // El costo de una preparación no se guarda: se calcula con lo que cuestan sus
  // ingredientes (y, si lleva otra preparación, con los de esa).
  const elaborados = mapaDeElaborados(insumos.filter((i) => i.esElaborado));

  return (
    <div>
      <Cabecera
        titulo="Insumos"
        bajada="Materia prima que controlás aparte de la carta — se le arma una receta a cada producto (en su propia ficha) para que la venta descuente sola. Una preparación (salsa, masa…) se arma con otros insumos y se usa en las recetas como cualquier insumo."
      />

      <InsumosMaestroDetalle
        insumos={insumos.map((i) => ({
          id: i.id,
          nombre: i.nombre,
          categoriaId: i.categoriaId,
          unidadMedida: i.unidadMedida,
          iva: i.iva,
          rendimiento: Number(i.rendimiento),
          stockActual: Number(i.stockActual),
          stockMinimo: i.stockMinimo != null ? Number(i.stockMinimo) : null,
          costoUnitario: i.esElaborado
            ? costoDeElaborado(i.id, elaborados)
            : i.costoUnitario != null
              ? Number(i.costoUnitario)
              : null,
          activo: i.activo,
          esElaborado: i.esElaborado,
          rindeTanda: i.rindeTanda != null ? Number(i.rindeTanda) : null,
          ingredientes: i.ingredientes.map((g) => ({
            ingredienteId: g.ingredienteId,
            nombre: g.ingrediente.nombre,
            unidadMedida: etiquetaUnidadMedida(g.ingrediente.unidadMedida),
            cantidad: Number(g.cantidad),
            esElaborado: g.ingrediente.esElaborado,
          })),
        }))}
        categorias={categorias.map((c) => ({ id: c.id, nombre: c.nombre }))}
        almacenes={almacenes}
      />
    </div>
  );
}
