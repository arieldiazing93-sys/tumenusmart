/**
 * Pedir un evento ante la DNIT (cancelar un documento aprobado, inutilizar números). Solo deja anotada la solicitud: la tarea
 * programada la firma y la envía cuando corresponde (ver `envio.ts`). Así cancelar una venta nunca queda frenado por la DNIT,
 * el certificado o la conexión: se anota en la misma transacción y se resuelve aparte.
 *
 * Solo para el servidor. `db` es el cliente de la base o la `tx` de una transacción.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import { MAX_NUMEROS_A_INUTILIZAR } from "./eventos";

type Db = PrismaClient | Prisma.TransactionClient;

const MOTIVO_POR_DEFECTO = "Operación cancelada por el emisor";

/** Un motivo que cumple el largo que pide la DNIT (de 5 a `maximo` caracteres): si falta o es muy corto se completa. */
function motivoValido(motivo: string | null | undefined, maximo: number): string {
  const m = (motivo ?? "").replace(/\s+/g, " ").trim();
  return (m.length >= 5 ? m : m ? `${m} - ${MOTIVO_POR_DEFECTO}` : MOTIVO_POR_DEFECTO).slice(0, maximo);
}

export type ResultadoSolicitud = { creada: true; eventoId: string } | { creada: false; motivo: string };

/**
 * Pide la cancelación de un documento electrónico. No hace nada (y dice por qué) si el documento es una vista previa, si la DNIT
 * lo rechazó (no hay nada que cancelar), si ya está cancelado o si ya hay una cancelación pedida.
 */
export async function solicitarCancelacion(
  db: Db,
  datos: { storeId: string; documentoId: string; motivo: string | null; creadoPor: string }
): Promise<ResultadoSolicitud> {
  const doc = await db.documentoElectronico.findFirst({ where: { id: datos.documentoId, storeId: datos.storeId } });
  if (!doc) return { creada: false, motivo: "El documento no existe." };
  if (doc.vistaPrevia) return { creada: false, motivo: "Es una vista previa: nunca se envió a la DNIT." };
  if (doc.estado === "rechazado") return { creada: false, motivo: "La DNIT rechazó este documento: no hay nada que cancelar." };
  if (doc.estado === "cancelado") return { creada: false, motivo: "El documento ya está cancelado." };
  const yaPedida = await db.eventoElectronico.findFirst({
    where: { storeId: datos.storeId, documentoId: doc.id, tipo: "cancelacion", estado: { in: ["pendiente", "aprobado"] } },
  });
  if (yaPedida) return { creada: false, motivo: "Ya hay una cancelación pedida para este documento." };
  const evento = await db.eventoElectronico.create({
    data: {
      storeId: datos.storeId,
      tipo: "cancelacion",
      documentoId: doc.id,
      cdc: doc.cdc,
      motivo: motivoValido(datos.motivo, 500),
      creadoPor: datos.creadoPor,
    },
    select: { id: true },
  });
  return { creada: true, eventoId: evento.id };
}

/**
 * Pide la inutilización de un rango de números de una numeración (uno solo: desde = hasta). Sirve para el número de un documento
 * rechazado (que no se va a corregir con el mismo número) y para los saltos de numeración.
 */
export async function solicitarInutilizacion(
  db: Db,
  datos: { storeId: string; timbrado: string; establecimiento: string; punto: string; desde: number; hasta: number; tipoDocumento: number; motivo: string | null; creadoPor: string }
): Promise<ResultadoSolicitud> {
  if (datos.hasta < datos.desde || datos.hasta - datos.desde + 1 > MAX_NUMEROS_A_INUTILIZAR) {
    return { creada: false, motivo: `El rango tiene que ser de 1 a ${MAX_NUMEROS_A_INUTILIZAR} números.` };
  }
  const yaPedida = await db.eventoElectronico.findFirst({
    where: {
      storeId: datos.storeId,
      tipo: "inutilizacion",
      timbrado: datos.timbrado,
      establecimiento: datos.establecimiento,
      punto: datos.punto,
      numeroDesde: datos.desde,
      numeroHasta: datos.hasta,
      estado: { in: ["pendiente", "aprobado"] },
    },
  });
  if (yaPedida) return { creada: false, motivo: "Ya hay una inutilización pedida para ese rango." };
  const evento = await db.eventoElectronico.create({
    data: {
      storeId: datos.storeId,
      tipo: "inutilizacion",
      timbrado: datos.timbrado,
      establecimiento: datos.establecimiento,
      punto: datos.punto,
      numeroDesde: datos.desde,
      numeroHasta: datos.hasta,
      tipoDocumento: datos.tipoDocumento,
      motivo: motivoValido(datos.motivo, 150),
      creadoPor: datos.creadoPor,
    },
    select: { id: true },
  });
  return { creada: true, eventoId: evento.id };
}
