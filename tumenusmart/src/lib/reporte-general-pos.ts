/**
 * El reporte general de cuentas: ventas del Punto de Venta, pedidos de
 * mostrador (retiro/mesa) y pedidos de delivery ya entregados, mezclados en
 * una sola lista ordenada por fecha, con el importe de cada una repartido
 * en su columna de forma de pago — mismo criterio que un libro de caja de
 * toda la vida. "General" quiere decir general: todo lo que se cobró.
 *
 * El delivery entra con `cobroMetodo` (lo que el repartidor cobró de
 * verdad, no lo que el cliente dijo al pedir) — desde que se unificó ese
 * vocabulario con el de FormaPagoPos (mismos 4 valores:
 * efectivo/transferencia/tarjeta_debito/tarjeta_credito, ver
 * src/lib/rendicion.ts), normalizarFormaPagoPos ya lo reconoce sin
 * necesitar una quinta columna ni un mapeo aparte.
 *
 * Esto es independiente de la Rendición del repartidor: ese es un control
 * de plata en la calle (qué tiene que devolver, en mano), no un reporte de
 * ventas — un mismo pedido de delivery puede aparecer acá (se vendió, se
 * cobró) y seguir pendiente de rendir allá (todavía no se entregó la plata
 * físicamente). No son la misma pregunta.
 */
import { prismaDelLocal } from "./prisma-local";
import { normalizarFormaPagoPos, FORMAS_PAGO_POS, FORMA_PAGO_A_CREDITO, type FormaPagoPos } from "./turno-pos";

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

  const [ventas, cobros, pedidos, deliveries] = await Promise.all([
    // Las ventas a crédito no entran: este reporte es lo que se COBRÓ. Cuando
    // el cliente paga, aparece el cobro (más abajo).
    db.ventaPos.findMany({
      where: {
        creadoEn: { gte: rango.gte, lt: rango.lt },
        cancelada: false,
        formaPago: { not: FORMA_PAGO_A_CREDITO },
      },
      select: { id: true, numero: true, total: true, formaPago: true, creadoEn: true },
    }),
    // Los cobros de ventas a crédito, por el instante en que se cargaron (la
    // fecha del cobro es solo un día y no sirve para cortar por rango horario).
    db.cobroVenta.findMany({
      where: { createdAt: { gte: rango.gte, lt: rango.lt }, ventaPos: { cancelada: false } },
      select: { monto: true, formaPago: true, createdAt: true, ventaPos: { select: { id: true, numero: true } } },
    }),
    db.order.findMany({
      where: {
        turnoPosId: { not: null },
        updatedAt: { gte: rango.gte, lt: rango.lt },
        estado: { not: "cancelado" },
      },
      select: { id: true, numero: true, total: true, formaPagoPos: true, updatedAt: true },
    }),
    // Delivery ya entregado — fecha por entregadoEn (cuándo se cobró de
    // verdad), no updatedAt: es el mismo campo que ya usa Rendición para su
    // propio filtro de fecha, y retiro/mesa no lo tiene siempre cargado.
    db.order.findMany({
      where: {
        tipoEntrega: "delivery",
        estado: "entregado",
        entregadoEn: { gte: rango.gte, lt: rango.lt },
      },
      select: { id: true, numero: true, total: true, cobroMetodo: true, entregadoEn: true },
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
    ...cobros.map((c) => ({
      idPedido: null as number | null,
      idVenta: c.ventaPos.numero as number | null,
      idPedidoDb: null as string | null,
      idVentaDb: c.ventaPos.id as string | null,
      fecha: c.createdAt,
      importe: Number(c.monto),
      formaPago: normalizarFormaPagoPos(c.formaPago),
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
    ...deliveries.map((d) => ({
      idPedido: d.numero as number | null,
      idVenta: null as number | null,
      idPedidoDb: d.id as string | null,
      idVentaDb: null as string | null,
      fecha: d.entregadoEn!,
      importe: Number(d.total),
      formaPago: normalizarFormaPagoPos(d.cobroMetodo),
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
