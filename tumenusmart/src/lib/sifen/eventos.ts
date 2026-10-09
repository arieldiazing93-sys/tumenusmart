/**
 * Los eventos del emisor: CANCELACIÓN de un documento ya aprobado e INUTILIZACIÓN de números que no se usaron.
 *
 * Fuente: Manual Técnico v150, capítulo 11 (sección 11.1 qué son y 11.5 su estructura, 11.6 las reglas que aplica la DNIT), la
 * Nota Técnica 25 y el esquema oficial Evento_v150.xsd (contra el que se validan en las pruebas):
 *  - Un evento es <gGroupGesEve><rGesEve><rEve Id="…">…</rEve><Signature/></rGesEve></gGroupGesEve>. Lo que se firma es el
 *    <rEve> (la referencia es su atributo Id, un número de hasta 10 dígitos que genera el emisor), con la misma firma de los
 *    documentos.
 *  - Cancelación: solo de un documento Aprobado o Aprobado con observación, hasta 48 horas después de su aprobación si es
 *    una factura (168 horas para las demás), con un motivo de 5 a 500 caracteres.
 *  - Inutilización: de un rango de hasta 1000 números sin documento en la DNIT (un número que se salteó, o que quedó con un
 *    documento rechazado), con un motivo de 5 a 150 caracteres; se informa a más tardar a los 15 días del mes siguiente.
 *
 * Es puro (sin red ni base de datos): arma y firma el XML. El envío está en `envio.ts`.
 */

import { fechaHoraIso } from "./armar-de";
import { cdcValido } from "./cdc";
import { firmarReferencia, type MaterialFirma } from "./firma";
import { NAMESPACE_SIFEN, escaparTextoXml } from "./xml";

/** Horas que tiene el emisor para cancelar una factura electrónica desde que la DNIT la aprobó (Manual 11.1.2 y regla 4009). */
export const HORAS_PARA_CANCELAR_FACTURA = 48;
/** Lo máximo que se puede inutilizar de una vez (regla 4067). */
export const MAX_NUMEROS_A_INUTILIZAR = 1000;

export type EventoFirmado = {
  /** El <gGroupGesEve> completo, firmado: lo que va dentro de <dEvReg>. */
  xml: string;
  /** El identificador del evento (el Id del <rEve>). */
  idEvento: string;
  digestValue: string;
};

/** Un identificador de evento (de 1 a 10 dígitos): los últimos 10 dígitos de los milisegundos de ahora, que no se repiten. */
export function nuevoIdDeEvento(ahora: Date = new Date()): string {
  const id = String(ahora.getTime()).slice(-10).replace(/^0+(?=\d)/, "");
  return id === "0" ? "1" : id;
}

function validarMotivo(motivo: string, maximo: number): string | null {
  const m = motivo.replace(/\s+/g, " ").trim();
  if (m.length < 5) return "El motivo tiene que tener al menos 5 caracteres.";
  if (m.length > maximo) return `El motivo no puede pasar de ${maximo} caracteres.`;
  return null;
}

const limpiarMotivo = (motivo: string): string => motivo.replace(/\s+/g, " ").trim();

/** Arma y firma un evento con el grupo propio de su tipo (<rGeVeCan>…, <rGeVeInu>…). */
async function firmarEvento(idEvento: string, fechaFirma: Date, grupoDelTipo: string, material: MaterialFirma): Promise<EventoFirmado> {
  if (!/^\d{1,10}$/.test(idEvento)) throw new Error("El identificador del evento tiene que ser un número de hasta 10 dígitos");
  const cuerpo = `<dFecFirma>${fechaHoraIso(fechaFirma)}</dFecFirma><dVerFor>150</dVerFor><gGroupTiEvt>${grupoDelTipo}</gGroupTiEvt></rEve>`;
  // El <rEve> va escrito sin declarar el espacio de nombres (lo hereda de <gGroupGesEve>), pero lo que se firma es su forma
  // canónica, que sí lo lleva: <rEve xmlns="…" Id="…">.
  const canonico = `<rEve xmlns="${NAMESPACE_SIFEN}" Id="${idEvento}">${cuerpo}`;
  const { firmaXml, digestValue } = await firmarReferencia(idEvento, canonico, material);
  const xml = `<gGroupGesEve xmlns="${NAMESPACE_SIFEN}"><rGesEve><rEve Id="${idEvento}">${cuerpo}${firmaXml}</rGesEve></gGroupGesEve>`;
  return { xml, idEvento, digestValue };
}

/** Cancelación del documento con ese CDC. Lanza con un texto claro si los datos no sirven. */
export async function firmarCancelacion(
  datos: { cdc: string; motivo: string; idEvento?: string; fechaFirma?: Date },
  material: MaterialFirma
): Promise<EventoFirmado> {
  if (!cdcValido(datos.cdc)) throw new Error("El CDC del documento a cancelar no es válido");
  const error = validarMotivo(datos.motivo, 500);
  if (error) throw new Error(error);
  const fechaFirma = datos.fechaFirma ?? new Date();
  return firmarEvento(
    datos.idEvento ?? nuevoIdDeEvento(fechaFirma),
    fechaFirma,
    `<rGeVeCan><Id>${datos.cdc}</Id><mOtEve>${escaparTextoXml(limpiarMotivo(datos.motivo))}</mOtEve></rGeVeCan>`,
    material
  );
}

export type DatosInutilizacion = {
  /** El timbrado (8 dígitos), el establecimiento y el punto de expedición (3 dígitos cada uno). */
  timbrado: string;
  establecimiento: string;
  punto: string;
  /** El rango de números del documento, ambos incluidos. */
  desde: number;
  hasta: number;
  /** Tipo de documento: 1 = factura electrónica. */
  tipoDocumento: number;
  motivo: string;
  idEvento?: string;
  fechaFirma?: Date;
};

/** Inutilización de un rango de números (uno solo: desde = hasta). Lanza con un texto claro si los datos no sirven. */
export async function firmarInutilizacion(datos: DatosInutilizacion, material: MaterialFirma): Promise<EventoFirmado> {
  if (!/^\d{8}$/.test(datos.timbrado)) throw new Error("El timbrado tiene que tener 8 dígitos");
  if (!/^\d{3}$/.test(datos.establecimiento) || !/^\d{3}$/.test(datos.punto)) throw new Error("El establecimiento y el punto de expedición tienen que tener 3 dígitos");
  if (!Number.isInteger(datos.desde) || !Number.isInteger(datos.hasta) || datos.desde < 1 || datos.hasta > 9_999_999) throw new Error("Los números del rango tienen que estar entre 1 y 9999999");
  if (datos.hasta < datos.desde) throw new Error("El número final del rango tiene que ser mayor o igual al inicial");
  if (datos.hasta - datos.desde + 1 > MAX_NUMEROS_A_INUTILIZAR) throw new Error(`Se pueden inutilizar hasta ${MAX_NUMEROS_A_INUTILIZAR} números de una vez`);
  if (!Number.isInteger(datos.tipoDocumento) || datos.tipoDocumento < 1 || datos.tipoDocumento > 8) throw new Error("El tipo de documento no es válido");
  const error = validarMotivo(datos.motivo, 150);
  if (error) throw new Error(error);
  const numero = (n: number) => String(n).padStart(7, "0");
  const fechaFirma = datos.fechaFirma ?? new Date();
  return firmarEvento(
    datos.idEvento ?? nuevoIdDeEvento(fechaFirma),
    fechaFirma,
    `<rGeVeInu><dNumTim>${datos.timbrado}</dNumTim><dEst>${datos.establecimiento}</dEst><dPunExp>${datos.punto}</dPunExp>` +
      `<dNumIn>${numero(datos.desde)}</dNumIn><dNumFin>${numero(datos.hasta)}</dNumFin><iTiDE>${datos.tipoDocumento}</iTiDE>` +
      `<mOtEve>${escaparTextoXml(limpiarMotivo(datos.motivo))}</mOtEve></rGeVeInu>`,
    material
  );
}

/**
 * ¿Todavía se puede cancelar una factura? Desde que la DNIT la aprobó hay 48 horas (regla 4009). Devuelve las horas que quedan
 * (puede ser negativo si ya pasó el plazo).
 */
export function horasQueQuedanParaCancelar(aprobadoEn: Date, ahora: Date = new Date()): number {
  return HORAS_PARA_CANCELAR_FACTURA - (ahora.getTime() - aprobadoEn.getTime()) / 3_600_000;
}
