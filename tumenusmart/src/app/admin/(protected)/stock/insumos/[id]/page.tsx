import { notFound } from "next/navigation";
import { pantallaConPermiso } from "@/lib/auth";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { Cabecera } from "@/components/ui";
import { Volver } from "@/components/Volver";
import { EditarInsumoForm } from "./EditarInsumoForm";

export const dynamic = "force-dynamic";

export default async function EditarInsumoPage({ params }: { params: Promise<{ id: string }> }) {
  await pantallaConPermiso("stock.ver");
  const { id } = await params;
  const prisma = prismaDelLocal(await idLocalActual());

  const [insumo, categorias] = await Promise.all([
    prisma.insumo.findUnique({ where: { id } }),
    prisma.categoriaInsumo.findMany({ orderBy: { nombre: "asc" } }),
  ]);
  if (!insumo) notFound();

  return (
    <div className="flex flex-col gap-4">
      <Volver href="/admin/stock/insumos" texto="Volver a Insumos" className="self-start" />
      <Cabecera titulo={insumo.nombre} bajada="Stock actual, costo y a qué categoría pertenece." />
      <EditarInsumoForm
        insumo={{
          id: insumo.id,
          nombre: insumo.nombre,
          categoriaId: insumo.categoriaId,
          unidadMedida: insumo.unidadMedida,
          stockActual: Number(insumo.stockActual),
          stockMinimo: insumo.stockMinimo != null ? Number(insumo.stockMinimo) : null,
          costoUnitario: insumo.costoUnitario != null ? Number(insumo.costoUnitario) : null,
          activo: insumo.activo,
        }}
        categorias={categorias}
      />
    </div>
  );
}
