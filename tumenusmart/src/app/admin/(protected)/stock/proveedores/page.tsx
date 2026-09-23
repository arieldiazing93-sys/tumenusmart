import { pantallaConPermiso } from "@/lib/auth";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { Cabecera } from "@/components/ui";
import { ProveedoresMaestroDetalle } from "./ProveedoresMaestroDetalle";

export const dynamic = "force-dynamic";

export default async function ProveedoresPage() {
  await pantallaConPermiso("stock.ver");
  const prisma = prismaDelLocal(await idLocalActual());

  const proveedores = await prisma.proveedor.findMany({
    orderBy: [{ activo: "desc" }, { nombre: "asc" }],
  });

  return (
    <div>
      <Cabecera
        titulo="Proveedores"
        bajada="A quién le comprás los insumos — se elige al registrar una compra o un gasto."
      />

      <ProveedoresMaestroDetalle
        proveedores={proveedores.map((p) => ({
          id: p.id,
          nombre: p.nombre,
          razonSocial: p.razonSocial ?? "",
          ruc: p.ruc ?? "",
          telefono: p.telefono ?? "",
          ciudad: p.ciudad ?? "",
          email: p.email ?? "",
          notas: p.notas ?? "",
          activo: p.activo,
        }))}
      />
    </div>
  );
}
