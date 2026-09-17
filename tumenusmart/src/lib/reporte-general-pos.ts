/**
 * El reporte general de cuentas: pedidos de mostrador (retiro/mesa) y
 * ventas del Punto de Venta, mezclados en una sola lista ordenada por
 * fecha, con el importe de cada una repartido en su columna de forma de
 * pago — mismo criterio que un libro de caja de toda la vida.
 *
 * A propósito NO incluye pedidos de delivery: esos tienen su propio cierre
 * con el repartidor (Rendición), con su propio criterio de qué es "cobrado
 * de verdad" (cobroMetodo). Mezclar los dos duplicaría o contradiría ese
 * reporte. Acá solo entra lo que ya comparte una sola forma de pago real y
 * un solo cierre: ventas de mostrador y pedidos atados a un turno de POS
 * (ver Order.turnoPosId, cambiarEstadoPedido en pedidos/actions.ts).
 */
import { prismaDelLocal } from "./prisma-local";
import { normalizarFormaPagoPos, FORMAS_PAGO_POS, type FormaPagoPos } from "./turno-pos";

export type FilaReporteGeneral = {
  n: number;
  /** Número correlativo para mostrar (ver formatearNumero). */
  idPedido: number | null;
  idVenta: number | null;
  /** El id real (cuid) de la base, para armar el link — nunca se muestra. */
  idPedidoDb: string | null;
  idVentaDb: string | null;
  fecha: Date;
  importe: number;
  formaPago: FormaPagoPos;
};

export type ReporteGeneralPos = {
  filas: FilaReporteGeneral[];
  totalImporte: number;
  totalPorForma: Record<FormaPagoPos, number>;
};

export async function calcularReporteGeneralPos(
  storeId: string,
  rango: { gte: Date; lt: Date }
): Promise<ReporteGeneralPos> {
  const db = prismaDelLocal(storeId);

  const [ventas, pedidos] = await Promise.all([
    db.ventaPos.findMany({
      where: { creadoEn: { gte: rango.gte, lt: rango.lt }, cancelada: false },
      select: { id: true, numero: true, total: true, formaPago: true, creadoEn: true },
    }),
    db.order.findMany({
      where: {
        turnoPosId: { not: null },
        updatedAt: { gte: rango.gte, lt: rango.lt },
        estado: { not: "cancelado" },
      },
      select: { id: true, numero: true, total: true, formaPagoPos: true, updatedAt: true },
    }),
  ]);

  const combinadas = [
    ...ventas.map((v) => ({
      idPedido: null as number | null,
      idVenta: v.numero as number | null,
      idPedidoDb: null as string | null,
      idVentaDb: v.id as string | null,
      fecha: v.creadoEn,
      importe: Number(v.total),
      formaPago: normalizarFormaPagoPos(v.formaPago),
    })),
    ...pedidos.map((p) => ({
      idPedido: p.numero as number | null,
      idVenta: null as number | null,
      idPedidoDb: p.id as string | null,
      idVentaDb: null as string | null,
      fecha: p.updatedAt,
      importe: Number(p.total),
      formaPago: normalizarFormaPagoPos(p.formaPagoPos),
    })),
  ].sort((a, b) => a.fecha.getTime() - b.fecha.getTime());

  const filas: FilaReporteGeneral[] = combinadas.map((c, i) => ({ n: i + 1, ...c }));

  const totalPorForma: Record<FormaPagoPos, number> = {
    efectivo: 0,
    transferencia: 0,
    tarjeta_debito: 0,
    tarjeta_credito: 0,
  };
  let totalImporte = 0;
  for (const f of filas) {
    totalImporte += f.importe;
    totalPorForma[f.formaPago] += f.importe;
  }

  return { filas, totalImporte, totalPorForma };
}

/** Las 4 formas de pago, para que quien arma la tabla no repita el orden a mano. */
export const COLUMNAS_FORMA_PAGO = FORMAS_PAGO_POS;
