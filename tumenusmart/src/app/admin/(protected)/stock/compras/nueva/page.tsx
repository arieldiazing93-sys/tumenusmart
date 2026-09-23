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

  const [proveedores, almacenes] = await Promise.all([
    prisma.proveedor.findMany({
      where: { activo: true },
      orderBy: { nombre: "asc" },
      select: { id: true, nombre: true, ruc: true },
    }),
    prisma.almacen.findMany({
      where: { activo: true },
      orderBy: { codigo: "asc" },
      select: { id: true, codigo: true, nombre: true },
    }),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <Volver href="/admin/stock/compras" texto="Volver a Compras" className="self-start" />
      <Cabecera
        titulo="Nueva compra"
        bajada="Cada línea suma stock al insumo elegido y actualiza su costo de reposición."
      />
      <NuevaCompraForm proveedores={proveedores} almacenes={almacenes} />
    </div>
  );
}
