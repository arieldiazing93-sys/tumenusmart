import { pantallaConPermiso } from "@/lib/auth";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { Cabecera } from "@/components/ui";
import { CrearAlmacenForm } from "./CrearAlmacenForm";
import { AlmacenFila } from "./AlmacenFila";

export const dynamic = "force-dynamic";

export default async function AlmacenesPage() {
  await pantallaConPermiso("stock.ver");
  const prisma = prismaDelLocal(await idLocalActual());

  const almacenes = await prisma.almacen.findMany({
    orderBy: [{ activo: "desc" }, { codigo: "asc" }],
  });

  return (
    <div>
      <Cabecera
        titulo="Almacenes"
        bajada="Depósitos donde guardás la mercadería (Cocina, Bodega...). Se elige el almacén en cada línea al registrar una compra."
      />

      <CrearAlmacenForm />

      <div className="flex flex-col gap-2">
        {almacenes.map((a) => (
          <AlmacenFila key={a.id} id={a.id} codigo={a.codigo} nombre={a.nombre} activo={a.activo} />
        ))}
        {almacenes.length === 0 && (
          <p className="text-sm text-tinta-suave">
            Todavía no cargaste ningún almacén — si tu negocio tiene un solo depósito, no hace falta.
          </p>
        )}
      </div>
    </div>
  );
}
