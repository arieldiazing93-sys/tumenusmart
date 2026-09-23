import Link from "next/link";
import { pantallaConPermiso } from "@/lib/auth";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { Cabecera, Vacio, clasesBoton } from "@/components/ui";
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
    // El más antiguo primero: es el que queda elegido de entrada en cada línea.
    prisma.almacen.findMany({
      where: { activo: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, nombre: true },
    }),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <Volver href="/admin/stock/compras" texto="Volver a Compras" className="self-start" />
      <Cabecera
        titulo="Nueva compra"
        bajada="Cada línea suma stock al insumo elegido, en el almacén que indiques, y actualiza su costo de reposición."
      />
      {almacenes.length === 0 ? (
        <Vacio
          titulo="Primero creá un almacén"
          detalle="Todo lo que se compra entra a un almacén. Creá al menos uno (por ejemplo, Almacén General) y volvé acá."
          accion={
            <Link href="/admin/stock/almacenes" className={clasesBoton("principal")}>
              Ir a Almacenes
            </Link>
          }
        />
      ) : (
        <NuevaCompraForm proveedores={proveedores} almacenes={almacenes} />
      )}
    </div>
  );
}
