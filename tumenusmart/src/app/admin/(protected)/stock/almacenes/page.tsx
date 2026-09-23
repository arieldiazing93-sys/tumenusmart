import { pantallaConPermiso } from "@/lib/auth";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { Cabecera } from "@/components/ui";
import { AlmacenesMaestroDetalle } from "./AlmacenesMaestroDetalle";

export const dynamic = "force-dynamic";

export default async function AlmacenesPage() {
  await pantallaConPermiso("stock.ver");
  const prisma = prismaDelLocal(await idLocalActual());

  const almacenes = await prisma.almacen.findMany({
    orderBy: [{ activo: "desc" }, { nombre: "asc" }],
  });

  return (
    <div>
      <Cabecera
        titulo="Almacenes"
        bajada="Depósitos donde guardás la mercadería (Cocina, Bodega...). Se elige el almacén en cada línea al registrar una compra."
      />

      <AlmacenesMaestroDetalle
        almacenes={almacenes.map((a) => ({ id: a.id, nombre: a.nombre, activo: a.activo }))}
      />
    </div>
  );
}
