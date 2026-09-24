import { prismaDelLocal } from "./prisma-local";
import { SIN_REGISTRO_FISCAL } from "./tipo-cliente";
import { FORMA_PAGO_A_CREDITO } from "./turno-pos";
import {
  diasParaVencer,
  estadoDeCuenta,
  redondear2,
  saldoDeCompra,
  type EstadoCuenta,
} from "./pagos-compra";

/**
 * Cuentas por cobrar: lo que los clientes le deben al negocio por ventas a
 * crédito del mostrador. Es el espejo de Cuentas por pagar: no se guarda ningún
 * saldo, lo que se debe de una venta es su total menos la suma de sus cobros
 * (CobroVenta). El saldo, el estado y los días para vencer usan las mismas
 * cuentas puras de pagos-compra.ts (sirven igual para "lo que falta").
 */

export type CobroDeVenta = {
  id: string;
  fecha: Date;
  monto: number;
  formaPago: string;
  notas: string | null;
  registradoPor: string;
};

export type FilaCuentaPorCobrar = {
  ventaId: string;
  numero: number;
  fecha: Date;
  cliente: string;
  telefono: string | null;
  /** RUC o cédula, si se facturó con registro fiscal. */
  identificacion: string | null;
  facturaNumero: string | null;
  vencimiento: Date | null;
  diasParaVencer: number | null;
  total: number;
  cobrado: number;
  saldo: number;
  estado: EstadoCuenta;
  /** De más viejo a más nuevo. */
  cobros: CobroDeVenta[];
};

export type ResumenClienteCobros = {
  /** Con qué se agrupó: RUC/cédula, si no teléfono, si no el nombre. */
  clave: string;
  cliente: string;
  telefono: string | null;
  /** Ventas con saldo. */
  ventas: number;
  saldo: number;
};

export type FiltroEstadoCobros = "con_saldo" | "cobradas" | "todas";

export type CuentasPorCobrar = {
  filas: FilaCuentaPorCobrar[];
  /** Lo que debe cada cliente (solo los que tienen saldo). */
  porCliente: ResumenClienteCobros[];
  /** Todo lo que se debe. */
  totalSaldo: number;
  /** Del total, lo que ya venció. */
  saldoVencido: number;
  /** Del total, lo que vence de hoy a 7 días. */
  saldoPorVencer: number;
};

/**
 * Las ventas a crédito no canceladas con lo que se debe de cada una. Los
 * totales (lo que se debe, lo vencido, lo que vence pronto) siempre salen de
 * TODAS las que tienen saldo del cliente buscado, sin importar el filtro de
 * estado: cambiar el filtro cambia la lista, no la deuda.
 *
 * `texto` busca por nombre, razón social, teléfono o RUC/cédula.
 */
export async function listarCuentasPorCobrar(
  storeId: string,
  filtro: { texto?: string | null; estado?: FiltroEstadoCobros } = {}
): Promise<CuentasPorCobrar> {
  const db = prismaDelLocal(storeId);
  const estado = filtro.estado ?? "con_saldo";
  const texto = filtro.texto?.trim() ?? "";

  const ventas = await db.ventaPos.findMany({
    where: {
      formaPago: FORMA_PAGO_A_CREDITO,
      cancelada: false,
      ...(texto
        ? {
            OR: [
              { clienteNombre: { contains: texto, mode: "insensitive" as const } },
              { facturaRazonSocial: { contains: texto, mode: "insensitive" as const } },
              { clienteTelefono: { contains: texto } },
              { facturaRuc: { contains: texto, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      numero: true,
      creadoEn: true,
      total: true,
      clienteNombre: true,
      clienteTelefono: true,
      facturaRazonSocial: true,
      facturaRuc: true,
      facturaNumero: true,
      fechaVencimientoCredito: true,
      cobros: { orderBy: [{ fecha: "asc" }, { createdAt: "asc" }] },
    },
    orderBy: [{ creadoEn: "desc" }],
    take: 1000,
  });

  const ahora = new Date();
  const todas: FilaCuentaPorCobrar[] = ventas.map((v) => {
    const total = Number(v.total);
    const cobrado = redondear2(v.cobros.reduce((s, c) => s + Number(c.monto), 0));
    const identificacion =
      v.facturaRuc && v.facturaRuc !== SIN_REGISTRO_FISCAL.numero ? v.facturaRuc : null;
    return {
      ventaId: v.id,
      numero: v.numero,
      fecha: v.creadoEn,
      cliente: (v.facturaRazonSocial ?? v.clienteNombre ?? "").trim() || "Cliente sin nombre",
      telefono: v.clienteTelefono,
      identificacion,
      facturaNumero: v.facturaNumero,
      vencimiento: v.fechaVencimientoCredito,
      diasParaVencer: diasParaVencer(v.fechaVencimientoCredito, ahora),
      total,
      cobrado,
      saldo: saldoDeCompra(total, cobrado),
      estado: estadoDeCuenta(total, cobrado),
      cobros: v.cobros.map((c) => ({
        id: c.id,
        fecha: c.fecha,
        monto: Number(c.monto),
        formaPago: c.formaPago,
        notas: c.notas,
        registradoPor: c.registradoPor,
      })),
    };
  });

  const conSaldo = todas.filter((f) => f.saldo > 0);

  const porCliente = new Map<string, ResumenClienteCobros>();
  let totalSaldo = 0;
  let saldoVencido = 0;
  let saldoPorVencer = 0;
  for (const f of conSaldo) {
    totalSaldo += f.saldo;
    if (f.diasParaVencer != null) {
      if (f.diasParaVencer < 0) saldoVencido += f.saldo;
      else if (f.diasParaVencer <= 7) saldoPorVencer += f.saldo;
    }
    const clave = f.identificacion ?? f.telefono ?? f.cliente.toLowerCase();
    const r = porCliente.get(clave) ?? { clave, cliente: f.cliente, telefono: f.telefono, ventas: 0, saldo: 0 };
    r.ventas += 1;
    r.saldo += f.saldo;
    porCliente.set(clave, r);
  }

  let filas: FilaCuentaPorCobrar[];
  if (estado === "con_saldo") {
    // Lo más urgente primero: las que vencen antes; las sin vencimiento, al final.
    filas = [...conSaldo].sort((a, b) => {
      const venceA = a.vencimiento ? a.vencimiento.getTime() : Number.POSITIVE_INFINITY;
      const venceB = b.vencimiento ? b.vencimiento.getTime() : Number.POSITIVE_INFINITY;
      // Ojo: Infinity - Infinity es NaN, por eso se compara antes de restar.
      if (venceA !== venceB) return venceA < venceB ? -1 : 1;
      return a.fecha.getTime() - b.fecha.getTime();
    });
  } else if (estado === "cobradas") {
    filas = todas.filter((f) => f.saldo <= 0);
  } else {
    filas = todas;
  }

  return {
    filas,
    porCliente: [...porCliente.values()].sort((a, b) => b.saldo - a.saldo),
    totalSaldo: redondear2(totalSaldo),
    saldoVencido: redondear2(saldoVencido),
    saldoPorVencer: redondear2(saldoPorVencer),
  };
}
