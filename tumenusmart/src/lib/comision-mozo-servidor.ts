import type { Prisma, PrismaClient } from "@prisma/client";
import { comisionPendiente, montoDeComision } from "./comision-mozo";

/**
 * Cuánto ganó de comisión cada mozo y cuánto se le pagó (solo servidor: lee la base).
 *
 * LO GANADO sale de las cuentas de mesa que el mozo cobró: el porcentaje y la base quedaron congelados al cobrar (CuentaMesa.comisionMozo*),
 * y cuenta solo si la venta con que se cobró NO se canceló después. LO PAGADO son sus pagos de comisión (cada uno, un retiro de caja).
 * Lo que se le debe es la diferencia, de siempre hasta hoy: un pago no pertenece a un período, descuenta del total que tiene a favor.
 *
 * Recibe el cliente de la base (el global o el de una transacción) y el local, y filtra por local en cada consulta: así la misma
 * cuenta sirve dentro de la transacción del pago (donde se vuelve a calcular lo que se le debe, con el cierre de la caja trabado).
 */

type Db = PrismaClient | Prisma.TransactionClient;

export type SaldoDeComision = {
  mozoId: string;
  /** Todo lo que ganó hasta hoy. */
  ganada: number;
  /** Todo lo que se le pagó hasta hoy. */
  pagada: number;
  /** Lo que se le debe hoy. */
  pendiente: number;
  /** Lo que ganó en el período pedido (igual a `ganada` si no se pidió período). */
  ganadaEnPeriodo: number;
  /** Lo que se le pagó en el período pedido (igual a `pagada` si no se pidió período). */
  pagadaEnPeriodo: number;
};

export async function saldosDeComision(
  db: Db,
  storeId: string,
  opciones: { periodo?: { gte: Date; lt: Date }; mozoId?: string } = {}
): Promise<Map<string, SaldoDeComision>> {
  const { periodo, mozoId } = opciones;
  const porMozo = mozoId ? { mozoId } : {};
  const [cuentas, pagos] = await Promise.all([
    db.cuentaMesa.findMany({
      where: {
        storeId,
        ...porMozo,
        ventaPosId: { not: null },
        comisionMozoPorcentaje: { not: null },
        comisionMozoBase: { not: null },
      },
      select: { mozoId: true, ventaPosId: true, comisionMozoPorcentaje: true, comisionMozoBase: true },
    }),
    db.pagoComisionMozo.findMany({ where: { storeId, ...porMozo }, select: { mozoId: true, monto: true, createdAt: true } }),
  ]);

  // Las ventas con que se cobraron esas cuentas: se descartan las canceladas y se toma el día en que se cobraron.
  const idsDeVentas = [...new Set(cuentas.flatMap((c) => (c.ventaPosId ? [c.ventaPosId] : [])))];
  const ventaPorId = new Map<string, { cancelada: boolean; creadoEn: Date }>();
  for (let i = 0; i < idsDeVentas.length; i += 2000) {
    const parte = idsDeVentas.slice(i, i + 2000);
    const ventas = await db.ventaPos.findMany({
      where: { storeId, id: { in: parte } },
      select: { id: true, cancelada: true, creadoEn: true },
    });
    for (const v of ventas) ventaPorId.set(v.id, { cancelada: v.cancelada, creadoEn: v.creadoEn });
  }

  const saldos = new Map<string, SaldoDeComision>();
  const de = (id: string): SaldoDeComision => {
    let s = saldos.get(id);
    if (!s) {
      s = { mozoId: id, ganada: 0, pagada: 0, pendiente: 0, ganadaEnPeriodo: 0, pagadaEnPeriodo: 0 };
      saldos.set(id, s);
    }
    return s;
  };
  const enPeriodo = (d: Date) => !periodo || (d >= periodo.gte && d < periodo.lt);

  for (const c of cuentas) {
    const venta = c.ventaPosId ? ventaPorId.get(c.ventaPosId) : undefined;
    if (!venta || venta.cancelada) continue;
    const monto = montoDeComision(Number(c.comisionMozoBase), Number(c.comisionMozoPorcentaje));
    const s = de(c.mozoId);
    s.ganada += monto;
    if (enPeriodo(venta.creadoEn)) s.ganadaEnPeriodo += monto;
  }
  for (const p of pagos) {
    const monto = Number(p.monto);
    const s = de(p.mozoId);
    s.pagada += monto;
    if (enPeriodo(p.createdAt)) s.pagadaEnPeriodo += monto;
  }
  for (const s of saldos.values()) s.pendiente = comisionPendiente(s.ganada, s.pagada);
  return saldos;
}
