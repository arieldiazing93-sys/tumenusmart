import { pantallaConPermiso } from "@/lib/auth";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { Cabecera, Tabla, Th, Td, Tr, Vacio, Pastilla } from "@/components/ui";
import { formatearGuarani } from "@/lib/format";
import { CrearGastoForm } from "./CrearGastoForm";
import { etiquetaCategoriaGasto } from "@/lib/categoria-gasto";

export const dynamic = "force-dynamic";

export default async function GastosPage() {
  await pantallaConPermiso("stock.ver");
  const prisma = prismaDelLocal(await idLocalActual());

  const [gastos, proveedores] = await Promise.all([
    prisma.gasto.findMany({
      orderBy: { fecha: "desc" },
      include: { proveedor: { select: { nombre: true } } },
      take: 100,
    }),
    prisma.proveedor.findMany({
      where: { activo: true },
      orderBy: { nombre: "asc" },
      select: { id: true, nombre: true },
    }),
  ]);

  return (
    <div>
      <Cabecera
        titulo="Gastos"
        bajada="Gastos generales del negocio — alquiler, servicios, sueldos... No necesitan estar ligados a una compra ni a un proveedor."
      />

      <CrearGastoForm proveedores={proveedores} />

      {gastos.length === 0 ? (
        <Vacio titulo="Todavía no cargaste ningún gasto" />
      ) : (
        <Tabla>
          <thead>
            <tr>
              <Th>Fecha</Th>
              <Th>Concepto</Th>
              <Th>Categoría</Th>
              <Th>Proveedor</Th>
              <Th>Monto</Th>
            </tr>
          </thead>
          <tbody>
            {gastos.map((g) => (
              <Tr key={g.id}>
                <Td>{g.fecha.toLocaleDateString("es-PY")}</Td>
                <Td className="font-medium text-tinta">{g.concepto}</Td>
                <Td>
                  <Pastilla>{etiquetaCategoriaGasto(g.categoria)}</Pastilla>
                </Td>
                <Td>{g.proveedor?.nombre ?? "—"}</Td>
                <Td className="font-medium text-tinta">{formatearGuarani(Number(g.monto))}</Td>
              </Tr>
            ))}
          </tbody>
        </Tabla>
      )}
    </div>
  );
}
