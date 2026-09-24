"use server";

import { revalidatePath } from "next/cache";
import { exigirPermiso } from "@/lib/auth";
import { idLocalActual } from "@/lib/local-actual";
import { prismaDelLocal } from "@/lib/prisma-local";
import { netoMovimientosCaja } from "../turno-actual";

export type TipoMovimientoCaja = "ingreso" | "retiro";

export type MovimientoCajaFila = {
  id: string;
  tipo: TipoMovimientoCaja;
  monto: number;
  concepto: string;
  registradoPor: string;
  /** ISO: la hora en que se cargó. */
  creadoEn: string;
  /** true si es el cobro en efectivo de una venta a crédito (se elimina desde Cuentas por cobrar). */
  esCobro: boolean;
};

export type ResultadoListarCaja =
  | { ok: true; movimientos: MovimientoCajaFila[]; ingresos: number; retiros: number; neto: number }
  | { ok: false; error: string };

export type ResultadoCaja = { ok: true } | { ok: false; error: string };

/** Lo máximo que cabe en la base (Decimal(12,2)) sin pasarse. */
const MAX_MONTO = 9_999_999_999;

/** Los movimientos de caja de un turno, del más nuevo al más viejo, con sus totales. */
export async function listarMovimientosCaja(turnoId: string): Promise<ResultadoListarCaja> {
  await exigirPermiso("pos.vender");
  const db = prismaDelLocal(await idLocalActual());

  const turno = await db.turnoPos.findUnique({ where: { id: turnoId }, select: { id: true } });
  if (!turno) return { ok: false, error: "Ese turno no existe." };

  const [filas, totales] = await Promise.all([
    db.movimientoCaja.findMany({
      where: { turnoPosId: turnoId },
      orderBy: { createdAt: "desc" },
      select: { id: true, tipo: true, monto: true, concepto: true, registradoPor: true, createdAt: true, cobroVentaId: true },
    }),
    netoMovimientosCaja(db, turnoId),
  ]);

  return {
    ok: true,
    ...totales,
    movimientos: filas.map((m) => ({
      id: m.id,
      tipo: m.tipo === "retiro" ? "retiro" : "ingreso",
      monto: Number(m.monto),
      concepto: m.concepto,
      registradoPor: m.registradoPor,
      creadoEn: m.createdAt.toISOString(),
      esCobro: m.cobroVentaId != null,
    })),
  };
}

/**
 * Anota una plata que entra a la caja (ingreso) o sale de ella (retiro) en
 * efectivo, dentro del turno abierto. El motivo es obligatorio: queda en el
 * historial del turno y en su comprobante de cierre. El efectivo que tendría
 * que haber al cerrar suma los ingresos y resta los retiros.
 */
export async function registrarMovimientoCaja(
  turnoId: string,
  datos: { tipo: TipoMovimientoCaja; monto: number; concepto: string }
): Promise<ResultadoCaja> {
  const sesion = await exigirPermiso("pos.vender");
  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);

  const tipo = datos.tipo === "retiro" ? "retiro" : datos.tipo === "ingreso" ? "ingreso" : null;
  if (!tipo) return { ok: false, error: "Elegí si es un ingreso o un retiro." };

  const monto = Math.round(Number(datos.monto) * 100) / 100;
  if (!Number.isFinite(monto) || monto <= 0) return { ok: false, error: "El monto tiene que ser mayor a cero." };
  if (monto > MAX_MONTO) return { ok: false, error: "Ese monto es demasiado grande." };

  const concepto = (datos.concepto ?? "").trim().slice(0, 200);
  if (!concepto) return { ok: false, error: "Escribí para qué es — queda en el historial del turno." };

  const turno = await db.turnoPos.findUnique({ where: { id: turnoId }, select: { estado: true } });
  if (!turno) return { ok: false, error: "Ese turno no existe." };
  if (turno.estado !== "abierto") {
    return { ok: false, error: "Ese turno ya está cerrado: no se le pueden cargar movimientos." };
  }

  await db.movimientoCaja.create({
    data: {
      storeId,
      turnoPosId: turnoId,
      tipo,
      monto,
      concepto,
      registradoPor: sesion.nombre?.trim() || sesion.email,
    },
  });

  revalidatePath("/admin/pos");
  return { ok: true };
}

/** Borra un movimiento cargado por error — solo mientras el turno sigue abierto. */
export async function eliminarMovimientoCaja(movimientoId: string): Promise<ResultadoCaja> {
  await exigirPermiso("pos.vender");
  const db = prismaDelLocal(await idLocalActual());

  const movimiento = await db.movimientoCaja.findUnique({
    where: { id: movimientoId },
    select: { id: true, cobroVentaId: true, turnoPos: { select: { estado: true } } },
  });
  if (!movimiento) return { ok: false, error: "Ese movimiento ya no existe." };
  if (movimiento.turnoPos.estado !== "abierto") {
    return { ok: false, error: "El turno ya está cerrado: ese movimiento quedó firmado en el cierre." };
  }
  if (movimiento.cobroVentaId) {
    return {
      ok: false,
      error: "Este ingreso es el cobro de una venta a crédito: eliminá el cobro desde Cuentas por cobrar.",
    };
  }

  await db.movimientoCaja.delete({ where: { id: movimientoId } });

  revalidatePath("/admin/pos");
  return { ok: true };
}
