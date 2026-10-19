import type { PrismaLocal } from "./prisma-local";
import type { PedidoAnalisis, ProductoAnalisis } from "./analista";
import { costoDelProducto } from "./costo-receta";
import { aplanarReceta } from "./insumo-elaborado";

/**
 * Las ventas de los últimos días, en la forma que lee el analista de Ideas (`PedidoAnalisis`). Hoy todo lo que se vende entra como una
 * venta del Punto de Venta (mostrador, comedor, delivery, citas cobradas de turnos y reservas de canchas cobradas), así que sale de ahí: ya no
 * hay pedidos de la carta. Una reserva todavía sin cobrar no es una venta y no cuenta; la hora de la venta es la del cobro.
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

/** Un producto tal como sale de la base (con su categoría y su receta), para convertirlo en lo que lee el analista. */
export type ProductoCrudo = {
  id: string;
  nombre: string;
  categoryId: string;
  category: { nombre: string; activa: boolean };
  precio: unknown;
  costo: Parameters<typeof costoDelProducto>[0];
  receta: Parameters<typeof aplanarReceta>[0];
  iva: string;
  disponible: boolean;
  createdAt: Date;
};

/**
 * El producto (o servicio, o cancha: todos son productos del punto de venta) en la forma que lee el analista. Dos reglas que valen igual
 * en la pantalla de Ideas y en la tarea semanal:
 *  - El costo sale de la receta con lo que cuestan sus insumos; una preparación (salsa, masa…) se costea con los insumos con que se hace.
 *  - Un producto de una categoría DESACTIVADA no se ofrece en ningún lado: no cuenta como «uno que no se vende».
 */
export function productoParaAnalisis(pr: ProductoCrudo, elaborados: Parameters<typeof aplanarReceta>[1]): ProductoAnalisis {
  return {
    id: pr.id,
    nombre: pr.nombre,
    categoriaId: pr.categoryId,
    categoriaNombre: pr.category.nombre,
    precio: Number(pr.precio),
    costo: costoDelProducto(pr.costo, aplanarReceta(pr.receta, elaborados)),
    iva: pr.iva,
    disponible: pr.disponible && pr.category.activa,
    creado: pr.createdAt,
  };
}
