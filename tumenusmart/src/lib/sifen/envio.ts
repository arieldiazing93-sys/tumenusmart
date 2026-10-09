/**
 * El envío de los documentos electrónicos firmados a la DNIT y qué hacer con lo que contesta.
 *
 * Reglas (Manual Técnico v150, capítulos 8, 9 y 12, y la Guía de Mejores Prácticas para la gestión del envío):
 *  - Cada documento se envía firmado al servicio síncrono de recepción; la DNIT contesta un protocolo con su estado:
 *    Aprobado, Aprobado con observación (también vale) o Rechazado (hay que corregir y emitir otro).
 *  - Si no hay comunicación (sin conexión, el servicio no responde, un error del servidor) NO es un rechazo: el documento
 *    sigue "firmado" y se reintenta solo, cada vez más espaciado. El plazo normal de transmisión es de 72 horas.
 *  - Cuando un intento terminó sin respuesta no se sabe si la DNIT lo recibió: antes de reenviar se consulta por el CDC. Si ya
 *    existe, se toma como aprobado y no se manda de nuevo (así no se duplica nada).
 *  - Una respuesta de "documento duplicado" (códigos 1001 y 1002) también se resuelve consultando el CDC.
 *
 * La conexión real está en `transporte.ts`; las pruebas la reemplazan por una DNIT simulada.
 * Solo para el servidor.
 */

import { prisma } from "../prisma";
import { prismaDelLocal } from "../prisma-local";
import { HORAS_PARA_CANCELAR_FACTURA, firmarCancelacion, firmarInutilizacion, horasQueQuedanParaCancelar } from "./eventos";
import { verificarFirmaEvento } from "./firma";
import { cargarClaveDeFirma, cargarMaterialTls } from "./servidor";
import { transporteHttps, type Contestacion, type Transporte } from "./transporte";
import {
  cuerpoConsultaDE,
  cuerpoEvento,
  cuerpoRecepcionDE,
  leerRespuestaConsulta,
  leerRespuestaEvento,
  leerRespuestaRecepcion,
  nuevoIdDeEnvio,
  sobreSoap,
  type AmbienteWs,
  type ResultadoProceso,
} from "./ws";

/** El plazo normal para transmitir un documento desde que se emite (Manual 12; Guía de Mejores Prácticas). */
export const HORAS_PLAZO_TRANSMISION = 72;

/** Minutos de espera antes del reintento número N (1, 2, 3…): crece y se queda en 2 horas. */
const MINUTOS_ENTRE_REINTENTOS = [1, 2, 5, 10, 20, 40, 60, 120];

export function minutosHastaReintento(intentos: number): number {
  const i = Math.min(Math.max(Math.floor(intentos), 1), MINUTOS_ENTRE_REINTENTOS.length) - 1;
  return MINUTOS_ENTRE_REINTENTOS[i];
}

export type OpcionesEnvio = {
  transporte?: Transporte;
  ahora?: Date;
};

export type ResultadoEnvio =
  | { ok: true; estado: "aprobado" | "aprobado_con_observacion" | "rechazado"; protocolo: string | null; mensaje: string }
  | { ok: false; motivo: "no_corresponde" | "comunicacion"; mensaje: string; reintentarEn?: Date };

const texto = (resultados: ResultadoProceso[]): string =>
  resultados
    .map((r) => [r.codigo, r.mensaje].filter(Boolean).join(": "))
    .filter(Boolean)
    .join(" | ")
    .slice(0, 1000);

/** Un trozo de lo recibido, sin saltos ni etiquetas, para dejarlo en el mensaje de error. */
function resumirCuerpo(cuerpo: string): string {
  const limpio = cuerpo.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return limpio.slice(0, 200);
}

type DocumentoParaEnviar = {
  id: string;
  cdc: string;
  ambiente: string;
  xmlFirmado: string;
  enviadoEn: Date | null;
  intentos: number;
  firmadoEn: Date;
};

/** Anota un problema de comunicación y deja el documento listo para reintentar más tarde. */
async function registrarFalloDeComunicacion(
  storeId: string,
  doc: DocumentoParaEnviar,
  mensaje: string,
  ahora: Date,
  /** ¿Se llegó a hacer la llamada al servicio? Si sí, el documento pudo haber llegado aunque no haya respuesta. */
  intentado: boolean
): Promise<ResultadoEnvio> {
  const db = prismaDelLocal(storeId);
  const intentos = doc.intentos + 1;
  const reintentarEn = new Date(ahora.getTime() + minutosHastaReintento(intentos) * 60_000);
  const fueraDePlazo = ahora.getTime() - doc.firmadoEn.getTime() > HORAS_PLAZO_TRANSMISION * 3_600_000;
  const aviso = fueraDePlazo ? `Pasaron más de ${HORAS_PLAZO_TRANSMISION} horas desde la emisión. ` : "";
  await db.documentoElectronico.updateMany({
    where: { id: doc.id, estado: "firmado" },
    data: {
      intentos,
      enviadoEn: doc.enviadoEn ?? (intentado ? ahora : null),
      errorEnvio: `${aviso}${mensaje}`.slice(0, 500),
      proximoIntentoEn: reintentarEn,
    },
  });
  return { ok: false, motivo: "comunicacion", mensaje, reintentarEn };
}

async function registrarAprobado(
  storeId: string,
  doc: DocumentoParaEnviar,
  datos: { estado: "aprobado" | "aprobado_con_observacion"; protocolo: string | null; procesadoEn: Date | null; codigo: string | null; mensaje: string },
  ahora: Date
): Promise<ResultadoEnvio> {
  const db = prismaDelLocal(storeId);
  await db.documentoElectronico.updateMany({
    where: { id: doc.id, estado: "firmado" },
    data: {
      estado: datos.estado,
      protocoloAutorizacion: datos.protocolo,
      procesadoEn: datos.procesadoEn ?? ahora,
      enviadoEn: doc.enviadoEn ?? ahora,
      intentos: doc.intentos + 1,
      respuestaCodigo: datos.codigo,
      respuestaMensaje: datos.mensaje || null,
      errorEnvio: null,
      proximoIntentoEn: null,
    },
  });
  return { ok: true, estado: datos.estado, protocolo: datos.protocolo, mensaje: datos.mensaje };
}

/**
 * Consulta en la DNIT si el documento ya existe (por su CDC). Devuelve null si no hubo una respuesta clara (sin comunicación):
 * en ese caso no se sabe, y no se reenvía a ciegas.
 */
async function existeEnLaDnit(
  transporte: Transporte,
  tls: { certificadoPem: string; clavePem: string },
  ambiente: AmbienteWs,
  cdc: string,
  ahora: Date
): Promise<{ existe: boolean; protocolo: string | null; procesadoEn: Date | null; mensaje: string } | { error: string }> {
  let contestacion: Contestacion;
  try {
    contestacion = await transporte({ servicio: "consulta", ambiente, cuerpo: sobreSoap(cuerpoConsultaDE(nuevoIdDeEnvio(ahora), cdc)), ...tls });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No hubo comunicación con la DNIT" };
  }
  const r = leerRespuestaConsulta(contestacion.cuerpo);
  if (r.tipo === "falla") return { error: `La consulta devolvió un error: ${r.motivo}` };
  if (r.tipo === "ilegible") return { error: `La consulta no se pudo entender (HTTP ${contestacion.status}): ${r.motivo}. ${resumirCuerpo(contestacion.cuerpo)}`.trim() };
  // 0420 = no existe, 0421 = el RUC del certificado no tiene permiso, 0422 = existe.
  if (r.codigo !== "0422" && r.codigo !== "0420") return { error: `La consulta respondió ${r.codigo ?? "sin código"}: ${r.mensaje ?? ""}`.trim() };
  return { existe: r.existe, protocolo: r.protocoloAutorizacion, procesadoEn: r.procesadoEn, mensaje: `${r.codigo ?? ""}: ${r.mensaje ?? ""}`.trim() };
}

/**
 * Envía a la DNIT un documento firmado y deja su estado al día. Nunca lanza por un problema de comunicación: lo anota y
 * devuelve cuándo se reintenta. Si el documento no está pendiente (ya aprobado, rechazado o una vista previa) no hace nada.
 */
export async function enviarDocumento(storeId: string, documentoId: string, opciones: OpcionesEnvio = {}): Promise<ResultadoEnvio> {
  const transporte = opciones.transporte ?? transporteHttps;
  const ahora = opciones.ahora ?? new Date();
  const db = prismaDelLocal(storeId);

  const doc = await db.documentoElectronico.findFirst({ where: { id: documentoId } });
  if (!doc) return { ok: false, motivo: "no_corresponde", mensaje: "Ese documento no existe." };
  if (doc.vistaPrevia) return { ok: false, motivo: "no_corresponde", mensaje: "Es una vista previa de una factura autoimpresor: no se envía a la DNIT." };
  if (doc.estado !== "firmado") return { ok: false, motivo: "no_corresponde", mensaje: `El documento ya está en estado «${doc.estado}»: no hace falta enviarlo.` };

  const tls = await cargarMaterialTls(db, storeId);
  if (!tls.ok) return registrarFalloDeComunicacion(storeId, doc, tls.error, ahora, false);
  const credenciales = { certificadoPem: tls.certificadoPem, clavePem: tls.clavePem };
  const ambiente: AmbienteWs = doc.ambiente === "produccion" ? "produccion" : "pruebas";

  // Un intento anterior sin respuesta: puede haber llegado. Se averigua antes de mandarlo de nuevo.
  if (doc.enviadoEn) {
    const previo = await existeEnLaDnit(transporte, credenciales, ambiente, doc.cdc, ahora);
    if ("error" in previo) return registrarFalloDeComunicacion(storeId, doc, previo.error, ahora, true);
    if (previo.existe) {
      return registrarAprobado(storeId, doc, { estado: "aprobado", protocolo: previo.protocolo, procesadoEn: previo.procesadoEn, codigo: "0422", mensaje: "Ya figuraba en la DNIT (verificado por consulta del CDC)." }, ahora);
    }
  }

  let contestacion: Contestacion;
  try {
    contestacion = await transporte({ servicio: "recibe", ambiente, cuerpo: sobreSoap(cuerpoRecepcionDE(nuevoIdDeEnvio(ahora), doc.xmlFirmado)), ...credenciales });
  } catch (e) {
    return registrarFalloDeComunicacion(storeId, doc, e instanceof Error ? e.message : "No hubo comunicación con la DNIT", ahora, true);
  }

  const r = leerRespuestaRecepcion(contestacion.cuerpo);
  if (r.tipo === "falla") return registrarFalloDeComunicacion(storeId, doc, `La DNIT devolvió un error del servicio: ${r.motivo}`, ahora, true);
  if (r.tipo === "ilegible") {
    const cuerpo = resumirCuerpo(contestacion.cuerpo);
    return registrarFalloDeComunicacion(storeId, doc, `Respuesta de la DNIT que no se pudo entender (HTTP ${contestacion.status})${cuerpo ? `: ${cuerpo}` : ""}`, ahora, true);
  }

  const p = r.protocolo;
  const mensaje = texto(p.resultados);
  const primerCodigo = p.resultados[0]?.codigo ?? null;

  if (p.estado === "aprobado" || p.estado === "aprobado_con_observacion") {
    return registrarAprobado(storeId, doc, { estado: p.estado, protocolo: p.protocoloAutorizacion, procesadoEn: p.procesadoEn, codigo: primerCodigo, mensaje }, ahora);
  }

  if (p.estado === "rechazado") {
    // "Ya fue autorizado" (1001) o "documento duplicado" (1002): puede ser el mismo documento enviado antes. Se mira por CDC.
    if (p.resultados.some((x) => x.codigo === "1001" || x.codigo === "1002")) {
      const duplicado = await existeEnLaDnit(transporte, credenciales, ambiente, doc.cdc, ahora);
      if ("error" in duplicado) return registrarFalloDeComunicacion(storeId, doc, duplicado.error, ahora, true);
      if (duplicado.existe) {
        return registrarAprobado(storeId, doc, { estado: "aprobado", protocolo: duplicado.protocolo, procesadoEn: duplicado.procesadoEn, codigo: "0422", mensaje: "Ya figuraba en la DNIT (verificado por consulta del CDC)." }, ahora);
      }
    }
    await db.documentoElectronico.updateMany({
      where: { id: doc.id, estado: "firmado" },
      data: {
        estado: "rechazado",
        enviadoEn: doc.enviadoEn ?? ahora,
        procesadoEn: p.procesadoEn ?? ahora,
        intentos: doc.intentos + 1,
        respuestaCodigo: primerCodigo,
        respuestaMensaje: mensaje || null,
        errorEnvio: null,
        proximoIntentoEn: null,
      },
    });
    return { ok: true, estado: "rechazado", protocolo: null, mensaje };
  }

  // La DNIT contestó pero sin un estado claro: no se da por aprobado ni por rechazado, se vuelve a intentar.
  return registrarFalloDeComunicacion(storeId, doc, `La DNIT contestó sin un estado claro${mensaje ? `: ${mensaje}` : ""}`, ahora, true);
}

// ---------------------------------------------------------------------------
//  Eventos: cancelación e inutilización
// ---------------------------------------------------------------------------

export type ResultadoEvento =
  | { ok: true; estado: "aprobado" | "rechazado" | "omitido"; mensaje: string }
  | { ok: false; motivo: "no_corresponde" | "comunicacion" | "esperando"; mensaje: string; reintentarEn?: Date };

type EventoParaEnviar = {
  id: string;
  tipo: string;
  documentoId: string | null;
  cdc: string | null;
  timbrado: string | null;
  establecimiento: string | null;
  punto: string | null;
  numeroDesde: number | null;
  numeroHasta: number | null;
  tipoDocumento: number | null;
  motivo: string;
  idEvento: string | null;
  xmlFirmado: string | null;
  enviadoEn: Date | null;
  intentos: number;
  createdAt: Date;
};

/** Anota un problema de comunicación al enviar un evento y lo deja para reintentar. */
async function registrarFalloDeEvento(storeId: string, ev: EventoParaEnviar, mensaje: string, ahora: Date, intentado: boolean): Promise<ResultadoEvento> {
  const db = prismaDelLocal(storeId);
  const intentos = ev.intentos + 1;
  const reintentarEn = new Date(ahora.getTime() + minutosHastaReintento(intentos) * 60_000);
  await db.eventoElectronico.updateMany({
    where: { id: ev.id, estado: "pendiente" },
    data: { intentos, enviadoEn: ev.enviadoEn ?? (intentado ? ahora : null), errorEnvio: mensaje.slice(0, 500), proximoIntentoEn: reintentarEn },
  });
  return { ok: false, motivo: "comunicacion", mensaje, reintentarEn };
}

/**
 * Firma (si todavía no está firmado) y envía un evento pendiente. Una cancelación espera a que la DNIT haya aprobado el documento
 * (no se puede cancelar lo que no existe allá) y solo vale hasta 48 horas después de esa aprobación. Nunca lanza por un problema
 * de comunicación: lo anota y devuelve cuándo se reintenta.
 */
export async function enviarEvento(storeId: string, eventoId: string, opciones: OpcionesEnvio = {}): Promise<ResultadoEvento> {
  const transporte = opciones.transporte ?? transporteHttps;
  const ahora = opciones.ahora ?? new Date();
  const db = prismaDelLocal(storeId);

  const ev = await db.eventoElectronico.findFirst({ where: { id: eventoId } });
  if (!ev) return { ok: false, motivo: "no_corresponde", mensaje: "Ese evento no existe." };
  if (ev.estado !== "pendiente") return { ok: false, motivo: "no_corresponde", mensaje: `El evento ya está en estado «${ev.estado}».` };

  const cerrar = async (estado: "aprobado" | "rechazado" | "omitido", datos: Record<string, unknown>) => {
    await db.eventoElectronico.updateMany({ where: { id: ev.id, estado: "pendiente" }, data: { estado, errorEnvio: null, proximoIntentoEn: null, ...datos } });
  };

  // ---- ¿corresponde enviarlo ahora?
  let ambiente: AmbienteWs = "pruebas";
  let doc: { id: string } | null = null;
  if (ev.tipo === "cancelacion") {
    const documento = ev.documentoId ? await db.documentoElectronico.findFirst({ where: { id: ev.documentoId } }) : null;
    if (!documento) {
      await cerrar("omitido", { respuestaMensaje: "El documento ya no existe." });
      return { ok: true, estado: "omitido", mensaje: "El documento ya no existe." };
    }
    doc = { id: documento.id };
    if (documento.estado === "rechazado" || documento.estado === "cancelado") {
      const m = documento.estado === "rechazado" ? "La DNIT rechazó el documento: no hay nada que cancelar." : "El documento ya estaba cancelado.";
      await cerrar("omitido", { respuestaMensaje: m });
      return { ok: true, estado: "omitido", mensaje: m };
    }
    if (documento.estado === "firmado") {
      // Todavía no existe en la DNIT: se espera a que el documento se apruebe (se envía por su propio camino).
      const reintentarEn = new Date(ahora.getTime() + 2 * 60_000);
      await db.eventoElectronico.updateMany({ where: { id: ev.id, estado: "pendiente" }, data: { proximoIntentoEn: reintentarEn } });
      return { ok: false, motivo: "esperando", mensaje: "El documento todavía no fue aprobado por la DNIT: la cancelación espera.", reintentarEn };
    }
    const aprobadoEn = documento.procesadoEn ?? documento.enviadoEn ?? documento.firmadoEn;
    if (horasQueQuedanParaCancelar(aprobadoEn, ahora) <= 0) {
      const m = `Pasaron más de ${HORAS_PARA_CANCELAR_FACTURA} horas desde que la DNIT aprobó el documento: ya no se puede cancelar (corresponde emitir una nota de crédito).`;
      await cerrar("rechazado", { respuestaCodigo: "4009", respuestaMensaje: m, procesadoEn: ahora });
      return { ok: true, estado: "rechazado", mensaje: m };
    }
    ambiente = documento.ambiente === "produccion" ? "produccion" : "pruebas";
  } else {
    const config = await db.configFacturacionElectronica.findFirst({});
    ambiente = config?.ambiente === "produccion" ? "produccion" : "pruebas";
  }

  // ---- firmarlo (una sola vez: un reintento reenvía el mismo evento)
  let xml = ev.xmlFirmado;
  let idEvento = ev.idEvento;
  if (!xml) {
    const material = await cargarClaveDeFirma(db, storeId);
    if (!material.ok) return registrarFalloDeEvento(storeId, ev, material.error, ahora, false);
    try {
      const firmado =
        ev.tipo === "cancelacion"
          ? await firmarCancelacion({ cdc: ev.cdc ?? "", motivo: ev.motivo, fechaFirma: ahora }, material.material)
          : await firmarInutilizacion(
              {
                timbrado: ev.timbrado ?? "",
                establecimiento: ev.establecimiento ?? "",
                punto: ev.punto ?? "",
                desde: ev.numeroDesde ?? 0,
                hasta: ev.numeroHasta ?? 0,
                tipoDocumento: ev.tipoDocumento ?? 1,
                motivo: ev.motivo,
                fechaFirma: ahora,
              },
              material.material
            );
      const control = await verificarFirmaEvento(firmado.xml);
      if (!control.valida) throw new Error(`La firma del evento no pasó el autocontrol: ${control.motivo}`);
      xml = firmado.xml;
      idEvento = firmado.idEvento;
    } catch (e) {
      // Datos que no se pueden firmar (motivo muy corto, rango mal): no se arregla reintentando.
      const m = e instanceof Error ? e.message : "No se pudo firmar el evento";
      await cerrar("rechazado", { respuestaMensaje: m, procesadoEn: ahora });
      return { ok: true, estado: "rechazado", mensaje: m };
    }
    await db.eventoElectronico.updateMany({ where: { id: ev.id, estado: "pendiente" }, data: { xmlFirmado: xml, idEvento } });
  }

  // ---- enviarlo
  const tls = await cargarMaterialTls(db, storeId);
  if (!tls.ok) return registrarFalloDeEvento(storeId, ev, tls.error, ahora, false);
  let contestacion: Contestacion;
  try {
    contestacion = await transporte({ servicio: "evento", ambiente, cuerpo: sobreSoap(cuerpoEvento(nuevoIdDeEnvio(ahora), xml)), certificadoPem: tls.certificadoPem, clavePem: tls.clavePem });
  } catch (e) {
    return registrarFalloDeEvento(storeId, ev, e instanceof Error ? e.message : "No hubo comunicación con la DNIT", ahora, true);
  }
  const r = leerRespuestaEvento(contestacion.cuerpo);
  if (r.tipo === "falla") return registrarFalloDeEvento(storeId, ev, `La DNIT devolvió un error del servicio: ${r.motivo}`, ahora, true);
  if (r.tipo === "ilegible") {
    const cuerpo = resumirCuerpo(contestacion.cuerpo);
    return registrarFalloDeEvento(storeId, ev, `Respuesta de la DNIT que no se pudo entender (HTTP ${contestacion.status})${cuerpo ? `: ${cuerpo}` : ""}`, ahora, true);
  }

  const res = r.resultados[0];
  const mensaje = [res.codigo, res.mensaje].filter(Boolean).join(": ").slice(0, 1000);
  // 4003 (la cancelación ya estaba pedida) y 4066 (los números ya estaban inutilizados) significan que el evento ya figura en la DNIT.
  const yaRegistrado = res.estado === "rechazado" && (res.codigo === "4003" || res.codigo === "4066");
  if (res.estado === "aprobado" || res.estado === "aprobado_con_observacion" || yaRegistrado) {
    await cerrar("aprobado", {
      enviadoEn: ev.enviadoEn ?? ahora,
      procesadoEn: r.procesadoEn ?? ahora,
      intentos: ev.intentos + 1,
      protocoloAutorizacion: res.protocoloAutorizacion,
      respuestaCodigo: res.codigo,
      respuestaMensaje: mensaje || null,
    });
    if (doc) await db.documentoElectronico.updateMany({ where: { id: doc.id, estado: { in: ["aprobado", "aprobado_con_observacion"] } }, data: { estado: "cancelado" } });
    return { ok: true, estado: "aprobado", mensaje };
  }
  if (res.estado === "rechazado") {
    await cerrar("rechazado", { enviadoEn: ev.enviadoEn ?? ahora, procesadoEn: r.procesadoEn ?? ahora, intentos: ev.intentos + 1, respuestaCodigo: res.codigo, respuestaMensaje: mensaje || null });
    return { ok: true, estado: "rechazado", mensaje };
  }
  return registrarFalloDeEvento(storeId, ev, `La DNIT contestó sin un estado claro${mensaje ? `: ${mensaje}` : ""}`, ahora, true);
}

export type ResumenProceso = {
  revisados: number;
  aprobados: number;
  rechazados: number;
  conProblemas: number;
  omitidos: number;
  eventos: { revisados: number; aprobados: number; rechazados: number; conProblemas: number; esperando: number };
};

/**
 * Envía lo que está pendiente en TODOS los locales (lo llama la tarea programada cada minuto): primero los documentos y después
 * los eventos (una cancelación puede ser de un documento que se aprobó recién). Cada elemento se "reserva" antes de enviarlo, así
 * dos corridas que se pisan no lo mandan dos veces.
 */
export async function procesarPendientes(opciones: OpcionesEnvio & { limite?: number } = {}): Promise<ResumenProceso> {
  const ahora = opciones.ahora ?? new Date();
  const limite = opciones.limite ?? 20;
  const vence = { OR: [{ proximoIntentoEn: null }, { proximoIntentoEn: { lte: ahora } }] };

  const candidatos = await prisma.documentoElectronico.findMany({
    where: { estado: "firmado", vistaPrevia: false, ...vence },
    orderBy: { firmadoEn: "asc" },
    take: limite,
    select: { id: true, storeId: true },
  });
  const resumen: ResumenProceso = {
    revisados: candidatos.length,
    aprobados: 0,
    rechazados: 0,
    conProblemas: 0,
    omitidos: 0,
    eventos: { revisados: 0, aprobados: 0, rechazados: 0, conProblemas: 0, esperando: 0 },
  };
  for (const c of candidatos) {
    // Reserva: si otra corrida ya lo tomó, acá no encuentra nada que reservar.
    const reservado = await prisma.documentoElectronico.updateMany({
      where: { id: c.id, storeId: c.storeId, estado: "firmado", ...vence },
      data: { proximoIntentoEn: new Date(ahora.getTime() + 5 * 60_000) },
    });
    if (reservado.count !== 1) {
      resumen.omitidos++;
      continue;
    }
    const r = await enviarDocumento(c.storeId, c.id, opciones);
    if (r.ok && r.estado === "rechazado") resumen.rechazados++;
    else if (r.ok) resumen.aprobados++;
    else resumen.conProblemas++;
  }

  const eventos = await prisma.eventoElectronico.findMany({
    where: { estado: "pendiente", ...vence },
    orderBy: { createdAt: "asc" },
    take: limite,
    select: { id: true, storeId: true },
  });
  resumen.eventos.revisados = eventos.length;
  for (const e of eventos) {
    const reservado = await prisma.eventoElectronico.updateMany({
      where: { id: e.id, storeId: e.storeId, estado: "pendiente", ...vence },
      data: { proximoIntentoEn: new Date(ahora.getTime() + 5 * 60_000) },
    });
    if (reservado.count !== 1) continue;
    const r = await enviarEvento(e.storeId, e.id, opciones);
    if (r.ok && r.estado === "rechazado") resumen.eventos.rechazados++;
    else if (r.ok) resumen.eventos.aprobados++;
    else if (r.motivo === "esperando") resumen.eventos.esperando++;
    else resumen.eventos.conProblemas++;
  }
  return resumen;
}
