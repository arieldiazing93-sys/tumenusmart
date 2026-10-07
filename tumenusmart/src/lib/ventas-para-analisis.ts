import type { PrismaLocal } from "./prisma-local";
import type { PedidoAnalisis } from "./analista";

/**
 * Las ventas de los últimos días, en la forma que lee el analista de Ideas (`PedidoAnalisis`). Hoy todo lo que se vende entra como una
 * venta del Punto de Venta (mostrador, comedor, delivery y citas cobradas), así que sale de ahí: ya no hay pedidos de la carta.
 *
 *  - Una venta cancelada va como "cancelado" (el analista no la cuenta); las demás cuentan como entregadas.
 *  - `tipoEntrega`: "delivery" para el Servicio delivery, "mesa" para lo que se consume en el local y "retiro" para lo que se lleva.
 *  - El costo de envío es lo que suman las líneas de envío; esas líneas NO son productos y no entran en la lista de productos.
 *  - Sin teléfono (mucha venta de mostrador es un cliente de paso) el teléfono queda vacío: el analista no la cuenta como cliente.
 */
export async function cargarVentasParaAnalisis(db: PrismaLocal, desde: Date, tope: number): Promise<PedidoAnalisis[]> {
  const ventas = await db.ventaPos.findMany({
    where: { creadoEn: { gte: desde } },
    include: { items: true },
    orderBy: { creadoEn: "desc" },
    take: tope,
  });
  return ventas.map((v) => ({
    id: v.id,
    creado: v.creadoEn,
    estado: v.cancelada ? "cancelado" : "entregado",
    enviado: true,
    tipoEntrega: v.tipoEntrega === "delivery" ? "delivery" : v.tipoEntrega === "local" ? "mesa" : "retiro",
    total: Number(v.total),
    costoEnvio: v.items.filter((i) => i.esEnvio).reduce((s, i) => s + Number(i.precioUnitario) * i.cantidad, 0),
    clienteNombre: v.clienteNombre?.trim() || "Cliente de mostrador",
    clienteTelefono: v.clienteTelefono?.trim() ?? "",
    items: v.items
      .filter((i) => !i.esEnvio)
      .map((i) => ({
        productId: i.productId,
        nombre: i.nombreProducto,
        cantidad: i.cantidad,
        precioUnitario: Number(i.precioUnitario),
      })),
  }));
}
