import type { Prisma, PrismaClient } from "@prisma/client";
import { calcularComision, montoDelTrabajo } from "./agenda-personal";
import { comisionPendiente } from "./comision-mozo";

/**
 * Cuánto ganó de comisión cada persona del personal de la Reserva de turnos y cuánto se le pagó (solo servidor: lee la base).
 *
 * LO GANADO es lo mismo que cuenta el reporte de personal (ver reporte-personal.ts), pero de siempre:
 *  - de SERVICIO: sus citas cobradas cuyo cobro no se anuló, sobre lo que valen sus servicios (`montoDelTrabajo`), con el porcentaje que
 *    tenía al cobrar (si la cita es anterior a la comisión, el que tiene ahora); cuenta por el día del trabajo (`Cita.inicio`);
 *  - de PRODUCTO: sus ventas con comisión de producto no canceladas, sobre la base congelada (`comisionProductoBase`), con el porcentaje que
 *    tenía al vender; cuenta por el día de la venta (`VentaPos.creadoEn`).
 * LO PAGADO son sus pagos de comisión (cada uno, un retiro de caja). Lo que se le debe es la diferencia, de siempre hasta hoy: un pago no
 * pertenece a un período, descuenta del total que tiene a favor.
 *
 * Recibe el cliente de la base (el global o el de una transacción) y el local, y filtra por local en cada consulta: así la misma cuenta
 * sirve dentro de la transacción del pago, donde se vuelve a calcular lo que se le debe con el pago de esa persona trabado.
 */

type Db = PrismaClient | Prisma.TransactionClient;

export type SaldoDeComisionPersonal = {
  personalId: string;
  /** Todo lo que ganó hasta hoy (servicios + productos). */
  ganada: number;
  ganadaServicios: number;
  ganadaProductos: number;
  /** Todo lo que se le pagó hasta hoy. */
  pagada: number;
  /** Lo que se le debe hoy. */
  pendiente: number;
  /** Lo que ganó en el período pedido (igual a `ganada` si no se pidió período). */
  ganadaEnPeriodo: number;
  /** Lo que se le pagó en el período pedido (igual a `pagada` si no se pidió período). */
  pagadaEnPeriodo: number;
};

export async function saldosDeComisionPersonal(
  db: Db,
  storeId: string,
  opciones: { periodo?: { gte: Date; lt: Date }; personalId?: string } = {}
): Promise<Map<string, SaldoDeComisionPersonal>> {
  const { periodo, personalId } = opciones;
  const [equipo, citas, ventas, pagos] = await Promise.all([
    db.miembroPersonal.findMany({
      where: { storeId, ...(personalId ? { id: personalId } : {}) },
      select: { id: true, comisionPorcentaje: true, comisionProductoPorcentaje: true },
    }),
    db.cita.findMany({
      where: {
        storeId,
        ...(personalId ? { personalId } : {}),
        // Un trabajo terminado = una cita cobrada cuyo cobro no se anuló.
        ventaPos: { is: { cancelada: false } },
      },
      select: { personalId: true, inicio: true, comisionPorcentaje: true, precio: true, ventaPos: { select: { total: true } } },
    }),
    db.ventaPos.findMany({
      where: {
        storeId,
        personalId: personalId ? personalId : { not: null },
        cancelada: false,
        comisionProductoBase: { not: null },
      },
      select: { personalId: true, creadoEn: true, comisionProductoPorcentaje: true, comisionProductoBase: true },
    }),
    db.pagoComisionPersonal.findMany({
      where: { storeId, ...(personalId ? { personalId } : {}) },
      select: { personalId: true, monto: true, createdAt: true },
    }),
  ]);

  const actual = new Map(
    equipo.map((p) => [
      p.id,
      {
        servicio: p.comisionPorcentaje == null ? null : Number(p.comisionPorcentaje),
        producto: p.comisionProductoPorcentaje == null ? null : Number(p.comisionProductoPorcentaje),
      },
    ])
  );

  const saldos = new Map<string, SaldoDeComisionPersonal>();
  const de = (id: string): SaldoDeComisionPersonal => {
    let s = saldos.get(id);
    if (!s) {
      s = {
        personalId: id,
        ganada: 0,
        ganadaServicios: 0,
        ganadaProductos: 0,
        pagada: 0,
        pendiente: 0,
        ganadaEnPeriodo: 0,
        pagadaEnPeriodo: 0,
      };
      saldos.set(id, s);
    }
    return s;
  };
  const enPeriodo = (d: Date) => !periodo || (d >= periodo.gte && d < periodo.lt);

  for (const c of citas) {
    const porcentaje = c.comisionPorcentaje != null ? Number(c.comisionPorcentaje) : (actual.get(c.personalId)?.servicio ?? null);
    const monto = calcularComision(montoDelTrabajo(c.precio, c.ventaPos?.total), porcentaje);
    if (monto === 0) continue;
    const s = de(c.personalId);
    s.ganadaServicios += monto;
    s.ganada += monto;
    if (enPeriodo(c.inicio)) s.ganadaEnPeriodo += monto;
  }
  for (const v of ventas) {
    if (!v.personalId) continue;
    const porcentaje =
      v.comisionProductoPorcentaje != null ? Number(v.comisionProductoPorcentaje) : (actual.get(v.personalId)?.producto ?? null);
    const monto = calcularComision(Number(v.comisionProductoBase ?? 0), porcentaje);
    if (monto === 0) continue;
    const s = de(v.personalId);
    s.ganadaProductos += monto;
    s.ganada += monto;
    if (enPeriodo(v.creadoEn)) s.ganadaEnPeriodo += monto;
  }
  for (const p of pagos) {
    const monto = Number(p.monto);
    const s = de(p.personalId);
    s.pagada += monto;
    if (enPeriodo(p.createdAt)) s.pagadaEnPeriodo += monto;
  }
  for (const s of saldos.values()) s.pendiente = comisionPendiente(s.ganada, s.pagada);
  return saldos;
}
