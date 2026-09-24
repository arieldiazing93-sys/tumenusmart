import { prismaDelLocal } from "./prisma-local";
import {
  diasParaVencer,
  estadoDeCuenta,
  redondear2,
  saldoDeCompra,
  type EstadoCuenta,
} from "./pagos-compra";

/**
 * Cuentas por pagar: lo que el negocio le debe a sus proveedores por compras a
 * crédito. No se guarda ningún saldo: lo que se debe de una compra es su total
 * menos la suma de sus pagos (PagoCompra), así nunca se desincroniza. Lo puro
 * (formas de pago, saldo, vencimiento) vive en pagos-compra.ts.
 */

/** Un pago ya hecho de una compra, para el detalle de los reportes. */
export type PagoDeCuenta = {
  fecha: Date;
  monto: number;
  formaPago: string;
  notas: string | null;
  registradoPor: string | null;
};

export type FilaCuentaPorPagar = {
  compraId: string;
  proveedorId: string | null;
  proveedor: string;
  /** RUC del proveedor, si lo tiene cargado. */
  proveedorRuc: string | null;
  folio: string | null;
  fecha: Date;
  vencimiento: Date | null;
  diasParaVencer: number | null;
  total: number;
  pagado: number;
  saldo: number;
  estado: EstadoCuenta;
  /** De más viejo a más nuevo. */
  pagos: PagoDeCuenta[];
};

export type ResumenProveedorCuentas = {
  proveedorId: string | null;
  proveedor: string;
  /** Compras a crédito con saldo. */
  compras: number;
  saldo: number;
};

export type CuentasPorPagar = {
  /** Nombre del proveedor por el que se filtró, si se filtró. */
  proveedorFiltrado: string | null;
  estadoFiltrado: FiltroEstadoCuentas;
  /** Las compras que pide el filtro de estado, listas para mostrar. */
  filas: FilaCuentaPorPagar[];
  /** Lo que se debe a cada proveedor (solo los que tienen saldo). */
  porProveedor: ResumenProveedorCuentas[];
  /** Todo lo que se debe. */
  totalSaldo: number;
  /** Del total, lo que ya venció. */
  saldoVencido: number;
  /** Del total, lo que vence de hoy a 7 días. */
  saldoPorVencer: number;
};

export type FiltroEstadoCuentas = "con_saldo" | "pagadas" | "todas";

/**
 * Las compras a crédito no canceladas con lo que se debe de cada una. Los
 * totales (lo que se debe, lo vencido, lo que vence pronto) siempre salen de
 * TODAS las que tienen saldo del proveedor pedido, sin importar el filtro de
 * estado: cambiar el filtro cambia la lista, no la deuda.
 */
export async function listarCuentasPorPagar(
  storeId: string,
  filtro: { proveedorId?: string | null; estado?: FiltroEstadoCuentas } = {}
): Promise<CuentasPorPagar> {
  const db = prismaDelLocal(storeId);
  const estado = filtro.estado ?? "con_saldo";

  const compras = await db.compra.findMany({
    where: {
      condicionPago: "credito",
      cancelada: false,
      ...(filtro.proveedorId ? { proveedorId: filtro.proveedorId } : {}),
    },
    include: {
      proveedor: { select: { nombre: true, ruc: true } },
      pagos: { orderBy: [{ fecha: "asc" }, { createdAt: "asc" }] },
    },
    orderBy: [{ fecha: "desc" }, { createdAt: "desc" }],
    take: 1000,
  });

  const ahora = new Date();
  const todas: FilaCuentaPorPagar[] = compras.map((c) => {
    const total = Number(c.total);
    const pagado = redondear2(c.pagos.reduce((s, p) => s + Number(p.monto), 0));
    return {
      compraId: c.id,
      proveedorId: c.proveedorId,
      proveedor: c.proveedor?.nombre ?? "Sin proveedor",
      proveedorRuc: c.proveedor?.ruc ?? null,
      folio: c.numeroComprobante,
      fecha: c.fecha,
      vencimiento: c.fechaVencimiento,
      diasParaVencer: diasParaVencer(c.fechaVencimiento, ahora),
      total,
      pagado,
      saldo: saldoDeCompra(total, pagado),
      estado: estadoDeCuenta(total, pagado),
      pagos: c.pagos.map((p) => ({
        fecha: p.fecha,
        monto: Number(p.monto),
        formaPago: p.formaPago,
        notas: p.notas,
        registradoPor: p.registradoPor,
      })),
    };
  });

  const conSaldo = todas.filter((f) => f.saldo > 0);

  const porProveedor = new Map<string, ResumenProveedorCuentas>();
  let totalSaldo = 0;
  let saldoVencido = 0;
  let saldoPorVencer = 0;
  for (const f of conSaldo) {
    totalSaldo += f.saldo;
    if (f.diasParaVencer != null) {
      if (f.diasParaVencer < 0) saldoVencido += f.saldo;
      else if (f.diasParaVencer <= 7) saldoPorVencer += f.saldo;
    }
    const clave = f.proveedorId ?? "";
    const r = porProveedor.get(clave) ?? { proveedorId: f.proveedorId, proveedor: f.proveedor, compras: 0, saldo: 0 };
    r.compras += 1;
    r.saldo += f.saldo;
    porProveedor.set(clave, r);
  }

  let filas: FilaCuentaPorPagar[];
  if (estado === "con_saldo") {
    // Lo más urgente primero: las que vencen antes; las sin vencimiento, al final.
    filas = [...conSaldo].sort((a, b) => {
      const venceA = a.vencimiento ? a.vencimiento.getTime() : Number.POSITIVE_INFINITY;
      const venceB = b.vencimiento ? b.vencimiento.getTime() : Number.POSITIVE_INFINITY;
      // Ojo: Infinity - Infinity es NaN, por eso se compara antes de restar.
      if (venceA !== venceB) return venceA < venceB ? -1 : 1;
      return a.fecha.getTime() - b.fecha.getTime();
    });
  } else if (estado === "pagadas") {
    filas = todas.filter((f) => f.saldo <= 0);
  } else {
    filas = todas;
  }

  const proveedorElegido = filtro.proveedorId
    ? await db.proveedor.findUnique({ where: { id: filtro.proveedorId }, select: { nombre: true } })
    : null;

  return {
    proveedorFiltrado: proveedorElegido?.nombre ?? null,
    estadoFiltrado: estado,
    filas,
    porProveedor: [...porProveedor.values()].sort((a, b) => b.saldo - a.saldo),
    totalSaldo: redondear2(totalSaldo),
    saldoVencido: redondear2(saldoVencido),
    saldoPorVencer: redondear2(saldoPorVencer),
  };
}
