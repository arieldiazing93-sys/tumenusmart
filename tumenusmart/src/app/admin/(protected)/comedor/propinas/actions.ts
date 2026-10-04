"use server";

import { revalidatePath } from "next/cache";
import { exigirPermiso } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { idLocalActual } from "@/lib/local-actual";
import { prismaDelLocal } from "@/lib/prisma-local";
import { estacionActual } from "@/lib/estacion-actual";
import { registrarBitacora } from "@/lib/bitacora";
import { formatearGuarani } from "@/lib/format";
import { ErrorDeUsuario, pistaDelError } from "@/lib/comedor-servidor";
import { turnoAbierto } from "../../pos/turno-actual";

/**
 * Las propinas de los mozos (ver src/lib/propinas.ts): pagarlas, deshacer un pago y anular una propina cargada.
 *
 * Pagarle las propinas a un mozo es sacar efectivo de la caja: se anota como un RETIRO DE CAJA en el turno abierto de ESTA estación
 * (el mismo movimiento de caja de siempre, con su motivo), así el efectivo que tendría que haber al cerrar el turno ya lo descuenta.
 * Cada acción exige el permiso de la caja del comedor Y el de vender (es plata que sale de la caja), trabaja solo dentro del local
 * de la sesión y deja su rastro en la Bitácora. Devuelven un resultado en vez de lanzar, para poder decir por qué no se pudo.
 */

export type ResultadoPropina =
  | { ok: true; mensaje?: string; /** El retiro de caja de un pago de propinas: con él se imprime el comprobante. */ movimientoId?: string }
  | { ok: false; error: string };

const OPCIONES_TX = { timeout: 15_000, maxWait: 10_000 } as const;

function nombreDe(sesion: { nombre?: string | null; email: string }): string {
  return sesion.nombre?.trim() || sesion.email;
}

function refrescar() {
  revalidatePath("/admin/comedor/propinas");
  revalidatePath("/admin/pos");
}

/**
 * Le paga al mozo TODAS las propinas que tiene pendientes, en efectivo, desde la caja: un retiro de caja en el turno abierto de
 * esta estación (el mismo día de cobradas o en otro turno posterior: lo único que hace falta es un turno abierto).
 */
export async function pagarPropinasDeMozo(mozoId: string, totalMostrado: number): Promise<ResultadoPropina> {
  await exigirPermiso("comedor.gestionar");
  const sesion = await exigirPermiso("pos.vender");
  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);
  const quien = nombreDe(sesion);

  const estacion = await estacionActual(db);
  if (!estacion) {
    return { ok: false, error: "Esta computadora no está vinculada a una estación. Vinculala en Estaciones para poder pagar propinas." };
  }
  const turno = await turnoAbierto(db, estacion.id);
  if (!turno) {
    return { ok: false, error: "No hay un turno de caja abierto en esta estación. Abrilo en Punto de venta: el pago sale de la caja." };
  }

  const mozo = await db.mozo.findFirst({ where: { id: String(mozoId ?? "") }, select: { id: true, nombre: true, apellido: true } });
  if (!mozo) return { ok: false, error: "No encontré a ese mozo." };
  const nombreMozo = [mozo.nombre, mozo.apellido].filter(Boolean).join(" ");

  let resumen: { total: number; cantidad: number; movimientoId: string };
  try {
    resumen = await prisma.$transaction(async (tx) => {
      const pendientes = await tx.propinaMozo.findMany({
        where: { storeId, mozoId: mozo.id, estado: "pendiente" },
        select: { id: true, monto: true },
      });
      if (pendientes.length === 0) throw new ErrorDeUsuario("Ese mozo no tiene propinas pendientes.");
      const total = Math.round(pendientes.reduce((s, p) => s + Number(p.monto), 0) * 100) / 100;
      // Se paga TODO lo pendiente, nunca una parte. Si entró (o se anuló) una propina mientras la persona miraba la pantalla, el
      // monto que vio ya no es el real: se frena en vez de pagar uno distinto del que confirmó.
      if (Math.round(Number(totalMostrado)) !== Math.round(total)) {
        throw new ErrorDeUsuario(
          `Las propinas pendientes cambiaron: ahora son ${formatearGuarani(total)}. Actualizá la pantalla y revisá el monto antes de pagar.`
        );
      }

      // Primero el retiro de caja y después se marcan las propinas con su número: si algo falla, no queda ninguna de las dos cosas.
      const movimiento = await tx.movimientoCaja.create({
        data: {
          storeId,
          turnoPosId: turno.id,
          tipo: "retiro",
          monto: total,
          concepto: `Pago de propinas a ${nombreMozo} (${pendientes.length} ${pendientes.length === 1 ? "propina" : "propinas"})`,
          registradoPor: quien,
        },
        select: { id: true },
      });
      // El estado va en la condición: si otra caja las pagó (o se anularon) en el mismo instante, acá no encuentra todas y se deshace.
      const marcadas = await tx.propinaMozo.updateMany({
        where: { id: { in: pendientes.map((p) => p.id) }, storeId, estado: "pendiente" },
        data: { estado: "pagada", pagadaEn: new Date(), pagadaPor: quien, pagoMovimientoId: movimiento.id },
      });
      if (marcadas.count !== pendientes.length) {
        throw new ErrorDeUsuario("Las propinas cambiaron mientras se pagaban. Actualizá la pantalla y probá de nuevo.");
      }
      return { total, cantidad: pendientes.length, movimientoId: movimiento.id };
    }, OPCIONES_TX);
  } catch (e) {
    if (e instanceof ErrorDeUsuario) return { ok: false, error: e.message };
    console.error("[propinas] pagarPropinasDeMozo falló", e);
    return { ok: false, error: `No se pudo pagar. Revisá que no haya quedado el retiro en la caja. (Detalle: ${pistaDelError(e)})` };
  }

  await registrarBitacora(storeId, sesion, {
    modulo: "comedor",
    accion: "propinas_pagadas",
    descripcion: `Pagó ${formatearGuarani(resumen.total)} de propinas a ${nombreMozo} (${resumen.cantidad}), como retiro de caja.`,
    entidad: "MovimientoCaja",
    entidadId: resumen.movimientoId,
    detalle: { mozo: nombreMozo, total: resumen.total, propinas: resumen.cantidad },
  });
  refrescar();
  return {
    ok: true,
    mensaje: `Le pagaste ${formatearGuarani(resumen.total)} a ${nombreMozo}. Quedó como retiro de caja en el turno abierto.`,
    movimientoId: resumen.movimientoId,
  };
}

/**
 * Deshace un pago de propinas hecho por error: las propinas vuelven a "pendientes" y el retiro de caja se borra. Solo mientras el
 * turno en el que se pagó sigue abierto (después quedó firmado en el cierre).
 */
export async function deshacerPagoDePropinas(movimientoId: string): Promise<ResultadoPropina> {
  await exigirPermiso("comedor.gestionar");
  const sesion = await exigirPermiso("pos.vender");
  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);

  const movimiento = await db.movimientoCaja.findUnique({
    where: { id: String(movimientoId ?? "") },
    select: { id: true, monto: true, concepto: true, turnoPos: { select: { estado: true } } },
  });
  if (!movimiento) return { ok: false, error: "Ese pago ya no existe." };
  if (movimiento.turnoPos.estado !== "abierto") {
    return { ok: false, error: "El turno en el que se pagó ya está cerrado: ese pago quedó firmado en el cierre." };
  }

  let cantidad = 0;
  try {
    cantidad = await prisma.$transaction(async (tx) => {
      const vueltas = await tx.propinaMozo.updateMany({
        where: { pagoMovimientoId: movimiento.id, storeId, estado: "pagada" },
        data: { estado: "pendiente", pagadaEn: null, pagadaPor: null, pagoMovimientoId: null },
      });
      if (vueltas.count === 0) throw new ErrorDeUsuario("Ese movimiento de caja no es un pago de propinas.");
      await tx.movimientoCaja.deleteMany({ where: { id: movimiento.id, storeId } });
      return vueltas.count;
    }, OPCIONES_TX);
  } catch (e) {
    if (e instanceof ErrorDeUsuario) return { ok: false, error: e.message };
    console.error("[propinas] deshacerPagoDePropinas falló", e);
    return { ok: false, error: `No se pudo deshacer el pago. (Detalle: ${pistaDelError(e)})` };
  }

  await registrarBitacora(storeId, sesion, {
    modulo: "comedor",
    accion: "pago_de_propinas_deshecho",
    descripcion: `Deshizo un pago de propinas de ${formatearGuarani(Number(movimiento.monto))} (${movimiento.concepto}): ${cantidad} ${cantidad === 1 ? "propina volvió" : "propinas volvieron"} a pendientes y se borró el retiro de caja.`,
    entidad: "MovimientoCaja",
    entidadId: movimiento.id,
    detalle: { monto: Number(movimiento.monto), propinas: cantidad },
  });
  refrescar();
  return { ok: true };
}

/** Anula una propina cargada que sigue pendiente (por ejemplo, el cliente pidió que se la devuelvan): con motivo. */
export async function anularPropina(propinaId: string, motivo: string): Promise<ResultadoPropina> {
  await exigirPermiso("comedor.gestionar");
  const sesion = await exigirPermiso("pos.vender");
  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);

  const razon = String(motivo ?? "")
    .replace(/[\x00-\x1F\x7F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
  if (razon.length < 3) return { ok: false, error: "Escribí el motivo (al menos 3 letras)." };

  const propina = await db.propinaMozo.findFirst({
    where: { id: String(propinaId ?? "") },
    select: { id: true, monto: true, forma: true, estado: true, mozo: { select: { nombre: true, apellido: true } } },
  });
  if (!propina) return { ok: false, error: "No encontré esa propina." };
  if (propina.estado !== "pendiente") return { ok: false, error: "Solo se puede anular una propina que todavía no se le pagó al mozo." };

  const r = await db.propinaMozo.updateMany({
    where: { id: propina.id, estado: "pendiente" },
    data: { estado: "anulada", motivoAnulacion: razon },
  });
  if (r.count !== 1) return { ok: false, error: "Esa propina ya cambió de estado. Actualizá la pantalla." };

  const nombreMozo = [propina.mozo.nombre, propina.mozo.apellido].filter(Boolean).join(" ");
  await registrarBitacora(storeId, sesion, {
    modulo: "comedor",
    accion: "propina_anulada",
    descripcion: `Anuló una propina de ${formatearGuarani(Number(propina.monto))} de ${nombreMozo}. Motivo: ${razon}.`,
    entidad: "PropinaMozo",
    entidadId: propina.id,
    detalle: { mozo: nombreMozo, monto: Number(propina.monto), motivo: razon },
  });
  refrescar();
  return { ok: true };
}
