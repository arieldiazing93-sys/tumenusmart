import { notFound } from "next/navigation";
import { pantallaConPermiso } from "@/lib/auth";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { Cabecera, Tabla, Th, Td, Tr, Vacio, Pastilla, type ColorEstado } from "@/components/ui";
import { Volver } from "@/components/Volver";
import { etiquetaUnidadMedida } from "@/lib/unidad-medida";

export const dynamic = "force-dynamic";

const ETIQUETA_TIPO: Record<string, string> = {
  venta: "Venta",
  compra: "Compra",
  ajuste: "Ajuste de inventario",
  correccion: "Corrección de compra",
  cancelacion: "Cancelación (restitución)",
};

const COLOR_TIPO: Record<string, ColorEstado> = {
  venta: "peligro",
  compra: "exito",
  ajuste: "azul",
  correccion: "aviso",
  cancelacion: "marca",
};

export default async function HistorialInsumoPage({
  params,
}: {
  params: Promise<{ insumoId: string }>;
}) {
  await pantallaConPermiso("stock.ver");
  const { insumoId } = await params;
  const prisma = prismaDelLocal(await idLocalActual());

  const insumo = await prisma.insumo.findUnique({ where: { id: insumoId } });
  if (!insumo) notFound();

  const movimientos = await prisma.movimientoStock.findMany({
    where: { insumoId },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      almacen: { select: { nombre: true } },
      order: { select: { numero: true } },
      ventaPos: { select: { numero: true } },
      compra: { select: { numeroComprobante: true, proveedor: { select: { nombre: true } } } },
    },
  });

  return (
    <div className="flex flex-col gap-4">
      <Volver href="/admin/stock/inventario" texto="Volver a Registro de inventario" className="self-start" />
      <Cabecera
        titulo={`Historial — ${insumo.nombre}`}
        bajada={`Stock actual: ${Number(insumo.stockActual)} ${etiquetaUnidadMedida(insumo.unidadMedida)}`}
      />

      {movimientos.length === 0 ? (
        <Vacio titulo="Este insumo todavía no tiene ningún movimiento registrado" />
      ) : (
        <Tabla>
          <thead>
            <tr>
              <Th>Fecha</Th>
              <Th>Tipo</Th>
              <Th>Almacén</Th>
              <Th>Cantidad</Th>
              <Th>Referencia</Th>
              <Th>Quién</Th>
            </tr>
          </thead>
          <tbody>
            {movimientos.map((m) => {
              const cantidad = Number(m.cantidad);
              const referencia = m.order
                ? `Pedido #${m.order.numero}`
                : m.ventaPos
                  ? `Venta mostrador #${m.ventaPos.numero}`
                  : m.compra
                    ? `Compra${m.compra.proveedor ? ` — ${m.compra.proveedor.nombre}` : ""}${
                        m.compra.numeroComprobante ? ` (${m.compra.numeroComprobante})` : ""
                      }`
                    : m.motivo ?? "—";
              return (
                <Tr key={m.id}>
                  <Td>{m.createdAt.toLocaleString("es-PY")}</Td>
                  <Td>
                    <Pastilla color={COLOR_TIPO[m.tipo] ?? "neutro"}>
                      {ETIQUETA_TIPO[m.tipo] ?? m.tipo}
                    </Pastilla>
                  </Td>
                  <Td>{m.almacen?.nombre ?? "—"}</Td>
                  <Td className={`font-semibold ${cantidad < 0 ? "text-peligro" : "text-exito"}`}>
                    {cantidad > 0 ? "+" : ""}
                    {cantidad} {etiquetaUnidadMedida(insumo.unidadMedida)}
                  </Td>
                  <Td>{referencia}</Td>
                  <Td>{m.registradoPor ?? "—"}</Td>
                </Tr>
              );
            })}
          </tbody>
        </Tabla>
      )}
    </div>
  );
}
