import { pantallaConPermiso } from "@/lib/auth";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { Cabecera } from "@/components/ui";
import { InsumosMaestroDetalle } from "./InsumosMaestroDetalle";

export const dynamic = "force-dynamic";

export default async function InsumosPage() {
  await pantallaConPermiso("stock.ver");
  const prisma = prismaDelLocal(await idLocalActual());

  const [insumos, categorias] = await Promise.all([
    prisma.insumo.findMany({ orderBy: [{ activo: "desc" }, { nombre: "asc" }] }),
    prisma.categoriaInsumo.findMany({ orderBy: { nombre: "asc" } }),
  ]);

  return (
    <div>
      <Cabecera
        titulo="Insumos"
        bajada="Materia prima que controlás aparte de la carta — se le arma una receta a cada producto (en su propia ficha) para que la venta descuente sola."
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
          costoUnitario: i.costoUnitario != null ? Number(i.costoUnitario) : null,
          activo: i.activo,
        }))}
        categorias={categorias.map((c) => ({ id: c.id, nombre: c.nombre }))}
      />
    </div>
  );
}
