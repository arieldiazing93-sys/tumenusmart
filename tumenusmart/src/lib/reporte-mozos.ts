import { prismaDelLocal } from "./prisma-local";
import type { RangoFecha } from "./estadisticas";
import { prisma } from "./prisma";
import { montoDeComision } from "./comision-mozo";
import { saldosDeComision } from "./comision-mozo-servidor";

/**
 * Reporte de mozos (Servicio comedor): cuánto vendió cada mozo, con qué ticket, cuánto descuento se le dio a sus cuentas y
 * cuántos productos y cuentas se cancelaron. Es el control de la caja sobre el salón: de un vistazo se ve quién vende más,
 * y a quién se le cancela o se le descuenta mucho.
 *
 * A quién se le atribuye cada cosa:
 *  - Las VENTAS, al mozo a cargo de la cuenta (`CuentaMesa.mozoId`) y por el día en que se COBRÓ. Una venta cancelada
 *    (se cobró y después se anuló) no suma a las ventas: se cuenta aparte.
 *  - Las CUENTAS ABIERTAS, por el día en que se abrieron.
 *  - Los PRODUCTOS ENVIADOS y los PRODUCTOS CANCELADOS, al mozo que los envió desde su celular: lo que cargó la caja desde el
 *    panel no se le descuenta ni se le suma a ningún mozo.
 *  - Las CUENTAS CANCELADAS son las que se anularon antes de cobrarse (una cuenta abierta por error, un cliente que se fue).
 */

export type FilaMozo = {
  mozoId: string;
  nombre: string;
  activo: boolean;
  cuentasAbiertas: number;
  cuentasCobradas: number;
  /** Lo cobrado (ya con el descuento), de las cuentas cobradas. */
  ventas: number;
  /** Lo que ganó de comisión por esas cuentas (el % que tenía al cobrar sobre los productos, con el descuento restado). */
  comision: number;
  /** Lo que se le PAGÓ de comisión en el período (los pagos hechos desde la caja, por la fecha del pago). */
  comisionPagada: number;
  /** Lo que se le DEBE hoy de comisión (todo lo ganado hasta hoy menos todo lo pagado): no depende del período. */
  comisionPendiente: number;
  /** ventas ÷ cuentas cobradas. */
  ticketPromedio: number;
  /** Cuánto se descontó en total a sus cuentas cobradas. */
  descuentos: number;
  /** Cuentas cobradas que llevaron algún descuento. */
  cuentasConDescuento: number;
  /** Ventas de sus cuentas que se cobraron y después se cancelaron. */
  cobrosCancelados: number;
  /** Cuentas que se cancelaron antes de cobrarse. */
  cuentasCanceladas: number;
  /** Unidades que envió desde su celular. */
  productosEnviados: number;
  /** Unidades suyas que se cancelaron (y lo que valían). */
  productosCancelados: number;
  montoCancelado: number;
  /** Personas atendidas, solo de las cuentas cobradas que tenían la cantidad cargada; y lo vendido por persona. */
  comensales: number;
  ventaPorPersona: number | null;
};

export type ReporteMozos = {
  filas: FilaMozo[];
  /** Los mozos del local, para elegir uno en el filtro del reporte. */
  mozosDisponibles: { id: string; nombre: string; activo: boolean }[];
  totales: Omit<FilaMozo, "mozoId" | "nombre" | "activo" | "ticketPromedio" | "ventaPorPersona"> & {
    ticketPromedio: number;
    ventaPorPersona: number | null;
  };
};

function nombreDe(m: { nombre: string; apellido: string | null }): string {
  return [m.nombre, m.apellido].filter(Boolean).join(" ");
}

/**
 * `mozoId` limita el reporte a un solo mozo (null o vacío = todos). Con uno elegido se lo muestra aunque no haya tenido movimiento en el
 * período o esté desactivado, y los totales son los suyos.
 */
export async function calcularReporteMozos(storeId: string, rango: RangoFecha, mozoId?: string | null): Promise<ReporteMozos> {
  const db = prismaDelLocal(storeId);
  const elegido = mozoId ? String(mozoId) : null;
  const porMozo = elegido ? { mozoId: elegido } : {};

  const [mozos, ventas, abiertas, anuladasSinCobro, enviados, anulados, saldos] = await Promise.all([
    db.mozo.findMany({ select: { id: true, nombre: true, apellido: true, activo: true } }),
    db.ventaPos.findMany({
      where: { creadoEn: { gte: rango.gte, lt: rango.lt } },
      select: { id: true, total: true, descuento: true, cancelada: true },
    }),
    db.cuentaMesa.groupBy({
      by: ["mozoId"],
      where: { ...porMozo, abiertaEn: { gte: rango.gte, lt: rango.lt } },
      _count: { _all: true },
    }),
    db.cuentaMesa.groupBy({
      by: ["mozoId"],
      where: { ...porMozo, estado: "anulada", ventaPosId: null, cerradaEn: { gte: rango.gte, lt: rango.lt } },
      _count: { _all: true },
    }),
    db.itemCuentaMesa.groupBy({
      by: ["mozoId"],
      where: { ...porMozo, enviadoEn: { gte: rango.gte, lt: rango.lt }, cargadoPor: null },
      _sum: { cantidad: true },
    }),
    db.itemCuentaMesa.findMany({
      where: { ...porMozo, estado: "anulado", anuladoEn: { gte: rango.gte, lt: rango.lt }, cargadoPor: null },
      select: { mozoId: true, cantidad: true, precioUnitario: true },
    }),
    // Lo pagado de comisión en el período y lo que se les debe hoy (los pagos salen de la caja: ver Servicio comedor → Comisiones).
    saldosDeComision(prisma, storeId, { periodo: { gte: rango.gte, lt: rango.lt }, mozoId: elegido ?? undefined }),
  ]);

  // De las ventas del período, las que cobraron una cuenta de mesa y de qué mozo eran.
  const idsVentas = ventas.map((v) => v.id);
  const cuentasDeVentas = idsVentas.length
    ? await db.cuentaMesa.findMany({
        where: { ...porMozo, ventaPosId: { in: idsVentas } },
        select: { ventaPosId: true, mozoId: true, comensales: true, comisionMozoPorcentaje: true, comisionMozoBase: true },
      })
    : [];
  const ventaPorId = new Map(ventas.map((v) => [v.id, v]));

  const filas = new Map<string, FilaMozo>(
    mozos.map((m) => [
      m.id,
      {
        mozoId: m.id,
        nombre: nombreDe(m),
        activo: m.activo,
        cuentasAbiertas: 0,
        cuentasCobradas: 0,
        ventas: 0,
        comision: 0,
        comisionPagada: 0,
        comisionPendiente: 0,
        ticketPromedio: 0,
        descuentos: 0,
        cuentasConDescuento: 0,
        cobrosCancelados: 0,
        cuentasCanceladas: 0,
        productosEnviados: 0,
        productosCancelados: 0,
        montoCancelado: 0,
        comensales: 0,
        ventaPorPersona: null,
      },
    ])
  );
  // Por si alguien borró un mozo de la base a mano: no se rompe el reporte, queda con un nombre genérico.
  const fila = (mozoId: string): FilaMozo => {
    let f = filas.get(mozoId);
    if (!f) {
      f = {
        mozoId,
        nombre: "Mozo eliminado",
        activo: false,
        cuentasAbiertas: 0,
        cuentasCobradas: 0,
        ventas: 0,
        comision: 0,
        comisionPagada: 0,
        comisionPendiente: 0,
        ticketPromedio: 0,
        descuentos: 0,
        cuentasConDescuento: 0,
        cobrosCancelados: 0,
        cuentasCanceladas: 0,
        productosEnviados: 0,
        productosCancelados: 0,
        montoCancelado: 0,
        comensales: 0,
        ventaPorPersona: null,
      };
      filas.set(mozoId, f);
    }
    return f;
  };

  const ventasConComensales = new Map<string, number>(); // ventas de cada mozo que tenían los comensales cargados
  for (const c of cuentasDeVentas) {
    const v = c.ventaPosId ? ventaPorId.get(c.ventaPosId) : undefined;
    if (!v) continue;
    const f = fila(c.mozoId);
    if (v.cancelada) {
      f.cobrosCancelados += 1;
      continue;
    }
    f.cuentasCobradas += 1;
    f.ventas += Number(v.total);
    // Su comisión por esta cuenta: el % y la base que quedaron congelados al cobrarla (sin comisión, no suma).
    if (c.comisionMozoPorcentaje != null && c.comisionMozoBase != null) {
      f.comision += montoDeComision(Number(c.comisionMozoBase), Number(c.comisionMozoPorcentaje));
    }
    const descuento = Number(v.descuento);
    if (descuento > 0) {
      f.descuentos += descuento;
      f.cuentasConDescuento += 1;
    }
    if (c.comensales && c.comensales > 0) {
      f.comensales += c.comensales;
      ventasConComensales.set(c.mozoId, (ventasConComensales.get(c.mozoId) ?? 0) + Number(v.total));
    }
  }
  for (const a of abiertas) fila(a.mozoId).cuentasAbiertas += a._count._all;
  for (const a of anuladasSinCobro) fila(a.mozoId).cuentasCanceladas += a._count._all;
  for (const e of enviados) fila(e.mozoId).productosEnviados += e._sum.cantidad ?? 0;
  for (const a of anulados) {
    const f = fila(a.mozoId);
    f.productosCancelados += a.cantidad;
    f.montoCancelado += a.cantidad * Number(a.precioUnitario);
  }

  // La comisión pagada en el período y la que se les debe hoy.
  for (const s of saldos.values()) {
    const f = fila(s.mozoId);
    f.comisionPagada = s.pagadaEnPeriodo;
    f.comisionPendiente = s.pendiente;
  }

  const lista = [...filas.values()];
  for (const f of lista) {
    f.ticketPromedio = f.cuentasCobradas > 0 ? f.ventas / f.cuentasCobradas : 0;
    f.ventaPorPersona = f.comensales > 0 ? (ventasConComensales.get(f.mozoId) ?? 0) / f.comensales : null;
  }
  // Los que vendieron más arriba; los que no tuvieron nada en el período, al final (y solo los activos). Con un mozo elegido, solo él.
  const visibles = lista
    .filter((f) =>
      elegido
        ? f.mozoId === elegido
        : f.activo || f.cuentasAbiertas + f.cuentasCobradas + f.productosEnviados + f.cuentasCanceladas > 0 || f.comisionPagada > 0
    )
    .sort((a, b) => b.ventas - a.ventas || b.cuentasAbiertas - a.cuentasAbiertas || a.nombre.localeCompare(b.nombre, "es"));

  const suma = (campo: (f: FilaMozo) => number) => visibles.reduce((s, f) => s + campo(f), 0);
  const cuentasCobradas = suma((f) => f.cuentasCobradas);
  const ventasTotales = suma((f) => f.ventas);
  const comensales = suma((f) => f.comensales);
  const ventasConComensalesTotal = [...ventasConComensales.entries()]
    .filter(([id]) => visibles.some((f) => f.mozoId === id))
    .reduce((s, [, v]) => s + v, 0);

  return {
    filas: visibles,
    // Para el selector de mozo: todos los del local (también los desactivados, que pueden tener historia), por nombre.
    mozosDisponibles: mozos
      .map((m) => ({ id: m.id, nombre: nombreDe(m), activo: m.activo }))
      .sort((a, b) => Number(b.activo) - Number(a.activo) || a.nombre.localeCompare(b.nombre, "es")),
    totales: {
      cuentasAbiertas: suma((f) => f.cuentasAbiertas),
      cuentasCobradas,
      ventas: ventasTotales,
      comision: suma((f) => f.comision),
      comisionPagada: suma((f) => f.comisionPagada),
      comisionPendiente: suma((f) => f.comisionPendiente),
      ticketPromedio: cuentasCobradas > 0 ? ventasTotales / cuentasCobradas : 0,
      descuentos: suma((f) => f.descuentos),
      cuentasConDescuento: suma((f) => f.cuentasConDescuento),
      cobrosCancelados: suma((f) => f.cobrosCancelados),
      cuentasCanceladas: suma((f) => f.cuentasCanceladas),
      productosEnviados: suma((f) => f.productosEnviados),
      productosCancelados: suma((f) => f.productosCancelados),
      montoCancelado: suma((f) => f.montoCancelado),
      comensales,
      ventaPorPersona: comensales > 0 ? ventasConComensalesTotal / comensales : null,
    },
  };
}
