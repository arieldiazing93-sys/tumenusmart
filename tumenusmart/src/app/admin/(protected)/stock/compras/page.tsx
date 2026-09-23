import { pantallaConPermiso } from "@/lib/auth";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { Cabecera, Tabla, Th, Td, Tr, Vacio, BotonEnlace } from "@/components/ui";
import { formatearGuarani } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ComprasPage() {
  await pantallaConPermiso("stock.ver");
  const prisma = prismaDelLocal(await idLocalActual());

  const compras = await prisma.compra.findMany({
    orderBy: { fecha: "desc" },
    include: { proveedor: { select: { nombre: true } }, _count: { select: { items: true } } },
    take: 100,
  });

  return (
    <div>
      <Cabecera
        titulo="Compras"
        bajada="Cada compra suma stock a los insumos que trae y actualiza su costo de reposición."
        acciones={<BotonEnlace href="/admin/stock/compras/nueva">+ Nueva compra</BotonEnlace>}
      />

      {compras.length === 0 ? (
        <Vacio
          titulo="Todavía no registraste ninguna compra"
          detalle="Registrá la primera con el botón de arriba."
        />
      ) : (
        <Tabla>
          <thead>
            <tr>
              <Th>Fecha</Th>
              <Th>Proveedor</Th>
              <Th>Comprobante</Th>
              <Th>Insumos</Th>
              <Th>Total</Th>
            </tr>
          </thead>
          <tbody>
            {compras.map((c) => (
              <Tr key={c.id}>
                <Td>{c.fecha.toLocaleDateString("es-PY")}</Td>
                <Td>{c.proveedor?.nombre ?? "—"}</Td>
                <Td>{c.numeroComprobante ?? "—"}</Td>
                <Td>{c._count.items}</Td>
                <Td className="font-medium text-tinta">{formatearGuarani(Number(c.total))}</Td>
              </Tr>
            ))}
          </tbody>
        </Tabla>
      )}
    </div>
  );
}
