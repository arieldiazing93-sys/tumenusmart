"use server";

import { revalidatePath } from "next/cache";
import { exigirPermiso } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { idLocalActual } from "@/lib/local-actual";
import { prismaDelLocal } from "@/lib/prisma-local";
import { estacionActual } from "@/lib/estacion-actual";
import { registrarBitacora } from "@/lib/bitacora";
import { formatearGuarani } from "@/lib/format";
import { nombreCompleto } from "@/lib/agenda-personal";
import { validarPagoDeComision, textoDelPeriodo } from "@/lib/comision-mozo";
import { saldosDeComisionPersonal } from "@/lib/comision-personal-servidor";
import { exigirAutorizacion } from "@/lib/seguridad-servidor";
import { ErrorDeUsuario, pistaDelError } from "@/lib/comedor-servidor";
import { turnoAbierto } from "../../../pos/turno-actual";

/**
 * El pago de las comisiones del personal de la Reserva de turnos (ver src/lib/comision-personal-servidor.ts): registrar un pago (hoy o en
 * otra fecha, por el total o una parte de lo que se le debe) y deshacerlo.
 *
 * Es lo mismo que el pago de comisiones de los mozos: sacar efectivo de la caja se anota como un RETIRO DE CAJA en el turno abierto de
 * ESTA estación, así el efectivo que tendría que haber al cerrar el turno ya lo descuenta. Cada acción exige el permiso de configurar la
 * agenda (las comisiones las ve el dueño) Y el de vender (es plata que sale de la caja), pide la contraseña de Seguridad si el dueño
 * protegió el evento, trabaja solo dentro del local de la sesión y deja su rastro en la Bitácora. Devuelven un resultado en vez de lanzar.
 */

export type ResultadoComisionPersonal =
  | {
      ok: true;
      mensaje?: string;
      /** El retiro de caja de un pago de comisión: con él se imprime el comprobante. */
      movimientoId?: string;
    }
  // `requiereClave`: el evento está protegido (Ajustes → Seguridad) y falta la contraseña de un usuario autorizado, o no es correcta.
  | { ok: false; error: string; requiereClave?: true };

const OPCIONES_TX = { timeout: 15_000, maxWait: 10_000 } as const;

function nombreDe(sesion: { nombre?: string | null; email: string }): string {
  return sesion.nombre?.trim() || sesion.email;
}

function refrescar() {
  revalidatePath("/admin/agenda/personal/comisiones");
  revalidatePath("/admin/agenda/personal/reporte");
  revalidatePath("/admin/pos");
}

export type DatosDePagoDeComisionPersonal = {
  personalId: string;
  /** Guaraníes enteros: lo que se le paga ahora (puede ser todo lo que se le debe o una parte). */
  monto: number;
  /** El período de trabajo que paga, opcional ("YYYY-MM-DD"). */
  desde?: string | null;
  hasta?: string | null;
  nota?: string | null;
};

/**
 * Le paga a la persona (todo lo que se le debe o una parte), en efectivo, desde la caja: un retiro de caja en el turno abierto de esta
 * estación. El monto no puede pasar de lo que se le debe, y eso se vuelve a calcular dentro de la transacción con el pago de esa persona
 * trabado: dos cajas no pueden pagar de más.
 */
export async function pagarComisionDePersonal(
  datos: DatosDePagoDeComisionPersonal,
  autorizacion?: string
): Promise<ResultadoComisionPersonal> {
  await exigirPermiso("agenda.configurar");
  const sesion = await exigirPermiso("pos.vender");
  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);
  const quien = nombreDe(sesion);

  const estacion = await estacionActual(db);
  if (!estacion) {
    return { ok: false, error: "Esta computadora no está vinculada a una estación. Vinculala en Estaciones para poder pagar comisiones." };
  }
  const turno = await turnoAbierto(db, estacion.id);
  if (!turno) {
    return { ok: false, error: "No hay un turno de caja abierto en esta estación. Abrilo en Punto de venta: el pago sale de la caja." };
  }

  const persona = await db.miembroPersonal.findFirst({
    where: { id: String(datos?.personalId ?? "") },
    select: { id: true, nombre: true, apellido: true },
  });
  if (!persona) return { ok: false, error: "No encontré a esa persona." };
  const nombrePersona = nombreCompleto(persona);

  // Primero lo barato: el monto y el período contra lo que se le debe ahora. La contraseña se pide después, ya con todo en orden.
  const saldo = (await saldosDeComisionPersonal(prisma, storeId, { personalId: persona.id })).get(persona.id);
  const validado = validarPagoDeComision(datos, saldo?.pendiente ?? 0);
  if (!validado.ok) return { ok: false, error: validado.error };
  const pago = validado.pago;

  const clave = await exigirAutorizacion(storeId, sesion, "pago_comisiones", autorizacion);
  if (!clave.ok) return clave;

  const periodo = textoDelPeriodo(pago.desde, pago.hasta);
  const concepto = `Pago de comisión a ${nombrePersona}${periodo ? ` (${periodo})` : ""}${pago.nota ? ` · ${pago.nota}` : ""}`.slice(0, 250);

  let resultado: { movimientoId: string; pagoId: string; pendienteDespues: number };
  try {
    resultado = await prisma.$transaction(async (tx) => {
      // Un solo pago a la vez por persona: sin esto, dos cajas podrían leer el mismo saldo y pagarlo las dos.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"comision-personal:" + storeId + ":" + persona.id}))`;
      const ahora = (await saldosDeComisionPersonal(tx, storeId, { personalId: persona.id })).get(persona.id);
      const pendiente = ahora?.pendiente ?? 0;
      if (pago.monto > pendiente) {
        throw new ErrorDeUsuario(
          pendiente <= 0
            ? "Esa persona ya no tiene comisión pendiente de pago. Actualizá la pantalla."
            : `Lo que se le debe cambió: ahora son ${formatearGuarani(pendiente)}. Actualizá la pantalla y revisá el monto antes de pagar.`
        );
      }

      // Primero el retiro de caja y después el pago con su número: si algo falla, no queda ninguna de las dos cosas.
      const movimiento = await tx.movimientoCaja.create({
        data: { storeId, turnoPosId: turno.id, tipo: "retiro", monto: pago.monto, concepto, registradoPor: quien },
        select: { id: true },
      });
      const creado = await tx.pagoComisionPersonal.create({
        data: {
          storeId,
          personalId: persona.id,
          monto: pago.monto,
          desde: pago.desde,
          hasta: pago.hasta,
          nota: pago.nota,
          movimientoCajaId: movimiento.id,
          turnoPosId: turno.id,
          registradoPor: quien,
        },
        select: { id: true },
      });
      return { movimientoId: movimiento.id, pagoId: creado.id, pendienteDespues: pendiente - pago.monto };
    }, OPCIONES_TX);
  } catch (e) {
    if (e instanceof ErrorDeUsuario) return { ok: false, error: e.message };
    console.error("[comisiones-personal] pagarComisionDePersonal falló", e);
    return { ok: false, error: `No se pudo pagar. Revisá que no haya quedado el retiro en la caja. (Detalle: ${pistaDelError(e)})` };
  }

  await registrarBitacora(storeId, sesion, {
    modulo: "agenda",
    accion: "comision_pagada",
    descripcion: `Pagó ${formatearGuarani(pago.monto)} de comisión a ${nombrePersona}${periodo ? ` (${periodo})` : ""}, como retiro de caja.${
      clave.autorizo ? ` Autorizó ${clave.autorizo}.` : ""
    }`,
    entidad: "PagoComisionPersonal",
    entidadId: resultado.pagoId,
    detalle: {
      persona: nombrePersona,
      monto: pago.monto,
      desde: pago.desde,
      hasta: pago.hasta,
      nota: pago.nota,
      movimientoCajaId: resultado.movimientoId,
      pendienteDespues: resultado.pendienteDespues,
    },
  });
  refrescar();
  return {
    ok: true,
    mensaje:
      `Le pagaste ${formatearGuarani(pago.monto)} a ${nombrePersona}. Quedó como retiro de caja en el turno abierto.` +
      (resultado.pendienteDespues > 0 ? ` Le quedan ${formatearGuarani(resultado.pendienteDespues)} por cobrar.` : " Ya no tiene comisión pendiente."),
    movimientoId: resultado.movimientoId,
  };
}

/**
 * Deshace un pago de comisión hecho por error: se borra el pago y el retiro de caja, y lo que se le debe vuelve a subir. Solo mientras el
 * turno en el que se pagó sigue abierto (después quedó firmado en el cierre).
 */
export async function deshacerPagoDeComisionPersonal(pagoId: string, autorizacion?: string): Promise<ResultadoComisionPersonal> {
  await exigirPermiso("agenda.configurar");
  const sesion = await exigirPermiso("pos.vender");
  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);

  const pago = await db.pagoComisionPersonal.findFirst({
    where: { id: String(pagoId ?? "") },
    select: {
      id: true,
      monto: true,
      movimientoCajaId: true,
      turnoPosId: true,
      personal: { select: { nombre: true, apellido: true } },
    },
  });
  if (!pago) return { ok: false, error: "Ese pago ya no existe." };
  const turno = await db.turnoPos.findFirst({ where: { id: pago.turnoPosId }, select: { estado: true } });
  if (!turno || turno.estado !== "abierto") {
    return { ok: false, error: "El turno en el que se pagó ya está cerrado: ese pago quedó firmado en el cierre." };
  }

  const clave = await exigirAutorizacion(storeId, sesion, "pago_comisiones", autorizacion);
  if (!clave.ok) return clave;

  try {
    await prisma.$transaction(async (tx) => {
      const borrado = await tx.pagoComisionPersonal.deleteMany({ where: { id: pago.id, storeId } });
      if (borrado.count !== 1) throw new ErrorDeUsuario("Ese pago ya se había deshecho. Actualizá la pantalla.");
      await tx.movimientoCaja.deleteMany({ where: { id: pago.movimientoCajaId, storeId } });
    }, OPCIONES_TX);
  } catch (e) {
    if (e instanceof ErrorDeUsuario) return { ok: false, error: e.message };
    console.error("[comisiones-personal] deshacerPagoDeComisionPersonal falló", e);
    return { ok: false, error: `No se pudo deshacer el pago. (Detalle: ${pistaDelError(e)})` };
  }

  const nombrePersona = nombreCompleto(pago.personal);
  await registrarBitacora(storeId, sesion, {
    modulo: "agenda",
    accion: "pago_de_comision_deshecho",
    descripcion: `Deshizo un pago de comisión de ${formatearGuarani(Number(pago.monto))} a ${nombrePersona}: se borró el retiro de caja y lo adeudado volvió a subir.${
      clave.autorizo ? ` Autorizó ${clave.autorizo}.` : ""
    }`,
    entidad: "PagoComisionPersonal",
    entidadId: pago.id,
    detalle: { persona: nombrePersona, monto: Number(pago.monto), movimientoCajaId: pago.movimientoCajaId },
  });
  refrescar();
  return { ok: true, mensaje: "Pago deshecho: el retiro se borró de la caja." };
}
