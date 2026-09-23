import { pantallaConPermiso } from "@/lib/auth";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { Cabecera } from "@/components/ui";
import { Volver } from "@/components/Volver";
import { NuevaCompraForm } from "./NuevaCompraForm";

export const dynamic = "force-dynamic";

export default async function NuevaCompraPage() {
  await pantallaConPermiso("stock.editar");
  const prisma = prismaDelLocal(await idLocalActual());

  const [insumos, proveedores] = await Promise.all([
    prisma.insumo.findMany({
      where: { activo: true },
      orderBy: { nombre: "asc" },
      select: { id: true, nombre: true, unidadMedida: true },
    }),
    prisma.proveedor.findMany({
      where: { activo: true },
      orderBy: { nombre: "asc" },
      select: { id: true, nombre: true },
    }),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <Volver href="/admin/stock/compras" texto="Volver a Compras" className="self-start" />
      <Cabecera titulo="Nueva compra" bajada="Cada línea suma stock al insumo elegido y actualiza su costo." />
      <NuevaCompraForm insumos={insumos} proveedores={proveedores} />
    </div>
  );
}
