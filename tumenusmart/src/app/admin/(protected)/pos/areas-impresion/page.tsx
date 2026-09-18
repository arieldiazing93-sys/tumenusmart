import { pantallaConPermiso } from "@/lib/auth";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { Cabecera } from "@/components/ui";
import { CrearAreaForm } from "./CrearAreaForm";
import { AreaFila } from "./AreaFila";

export const dynamic = "force-dynamic";

export default async function AreasImpresionPage() {
  await pantallaConPermiso("pos.gestionarEstaciones");
  const prisma = prismaDelLocal(await idLocalActual());

  const areas = await prisma.areaImpresion.findMany({
    orderBy: [{ orden: "asc" }, { createdAt: "asc" }],
    include: { _count: { select: { productos: true } } },
  });

  return (
    <div>
      <Cabecera
        titulo="Áreas de impresión"
        bajada="A dónde se manda cada producto en la comanda automática (Cocina, Barra, Caja...). Cada Estación mapea estas áreas a sus propias impresoras en /admin/pos/estaciones."
      />

      <div className="mb-6 max-w-lg rounded-lg border border-linea bg-papel-suave px-4 py-3 text-[0.85rem] text-tinta-media">
        Un producto sin área asignada (ver /admin/productos) no imprime en
        ninguna comanda automática — comportamiento esperado, no un error.
      </div>

      <CrearAreaForm />

      <div className="flex flex-col gap-2">
        {areas.map((a) => (
          <AreaFila
            key={a.id}
            id={a.id}
            nombre={a.nombre}
            activa={a.activa}
            cantidadProductos={a._count.productos}
          />
        ))}
        {areas.length === 0 && (
          <p className="text-sm text-tinta-suave">Todavía no hay áreas de impresión creadas.</p>
        )}
      </div>
    </div>
  );
}
