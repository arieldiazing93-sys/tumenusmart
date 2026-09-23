import { pantallaConPermiso } from "@/lib/auth";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { Cabecera } from "@/components/ui";
import { CrearProveedorForm } from "./CrearProveedorForm";
import { ProveedorFila } from "./ProveedorFila";

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

      <CrearProveedorForm />

      <div className="flex flex-col gap-2">
        {proveedores.map((p) => (
          <ProveedorFila
            key={p.id}
            id={p.id}
            nombre={p.nombre}
            telefono={p.telefono ?? ""}
            email={p.email ?? ""}
            notas={p.notas ?? ""}
            activo={p.activo}
          />
        ))}
        {proveedores.length === 0 && (
          <p className="text-sm text-tinta-suave">Todavía no cargaste ningún proveedor.</p>
        )}
      </div>
    </div>
  );
}
