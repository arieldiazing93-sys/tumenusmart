/**
 * Los mensajes de los servicios web de la DNIT (SIFEN): cómo se arma lo que se envía y cómo se lee lo que contestan.
 *
 * Fuente: Manual Técnico v150, capítulos 7 (estándares: SOAP 1.2, Document/Literal, TLS 1.2 con autenticación mutua),
 * 8 y 9 (servicios y sus protocolos) y los esquemas oficiales WS_SiRecepDE_v150.xsd, protProcesDE_v150.xsd y
 * WS_SiConsDE_v141.xsd, contra los que se validan estos mensajes en las pruebas.
 *
 * Es puro (sin red ni base de datos): arma y lee texto. El envío de verdad está en `transporte.ts` y la lógica de estados
 * y reintentos en `envio.ts`.
 */

import { NAMESPACE_SIFEN, buscarElemento, hijosConNombre, leerElementos, textoDeElemento, type ElementoXml } from "./xml";

export type AmbienteWs = "pruebas" | "produccion";
export type Servicio = "recibe" | "recibeLote" | "evento" | "consulta" | "consultaLote" | "consultaRuc";

export const NS_SOAP = "http://www.w3.org/2003/05/soap-envelope";

/** Dónde vive cada servicio (Manual 7.10). */
const SERVIDOR: Record<AmbienteWs, string> = {
  pruebas: "https://sifen-test.set.gov.py/de/ws/",
  produccion: "https://sifen.set.gov.py/de/ws/",
};
const RUTA: Record<Servicio, string> = {
  recibe: "sync/recibe",
  recibeLote: "async/recibe-lote",
  evento: "eventos/evento",
  consulta: "consultas/consulta",
  consultaLote: "consultas/consulta-lote",
  consultaRuc: "consultas/consulta-ruc",
};

/**
 * Las direcciones a las que probar un servicio, en orden. El manual publica las del WSDL (terminadas en ".wsdl"); el servicio
 * en sí puede atender en esa misma dirección o en la misma sin la terminación. Como solo se puede confirmar con el ambiente
 * de pruebas real, el envío prueba la primera y, si el servidor contesta "no existe" (404/405), la segunda.
 */
export function urlsDelServicio(servicio: Servicio, ambiente: AmbienteWs): string[] {
  const base = SERVIDOR[ambiente] + RUTA[servicio];
  return [`${base}.wsdl`, base];
}

// ---------------------------------------------------------------------------
//  Lo que se envía
// ---------------------------------------------------------------------------

/** El mensaje SOAP 1.2 que lleva `cuerpo` (ya en XML) dentro de <Body>. */
export function sobreSoap(cuerpo: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><env:Envelope xmlns:env="${NS_SOAP}"><env:Header/><env:Body>${cuerpo}</env:Body></env:Envelope>`;
}

const sinDeclaracion = (xml: string): string => xml.replace(/^\s*<\?xml[^>]*\?>\s*/, "");

/** Recepción de un documento electrónico (síncrona): <rEnviDe> con un número de control y el <rDE> firmado. */
export function cuerpoRecepcionDE(dId: number, xmlRde: string): string {
  return `<rEnviDe xmlns="${NAMESPACE_SIFEN}"><dId>${dId}</dId><xDE>${sinDeclaracion(xmlRde)}</xDE></rEnviDe>`;
}

/** Consulta de un documento por su CDC. */
export function cuerpoConsultaDE(dId: number, cdc: string): string {
  return `<rEnviConsDeRequest xmlns="${NAMESPACE_SIFEN}"><dId>${dId}</dId><dCDC>${cdc}</dCDC></rEnviConsDeRequest>`;
}

/** Registro de un evento (cancelación, inutilización…): <rEnviEventoDe> con el evento ya firmado dentro de <dEvReg>. */
export function cuerpoEvento(dId: number, xmlEvento: string): string {
  return `<rEnviEventoDe xmlns="${NAMESPACE_SIFEN}"><dId>${dId}</dId><dEvReg>${sinDeclaracion(xmlEvento)}</dEvReg></rEnviEventoDe>`;
}

/**
 * Un número de control de envío (dId, hasta 15 dígitos, "autoincremental", responsabilidad del contribuyente): los
 * milisegundos de ahora más dos dígitos de contador, así dos envíos en el mismo milisegundo no repiten el número.
 */
let contador = 0;
export function nuevoIdDeEnvio(ahora: Date = new Date()): number {
  contador = (contador + 1) % 100;
  return Number(`${ahora.getTime()}${String(contador).padStart(2, "0")}`);
}

// ---------------------------------------------------------------------------
//  Lo que contestan
// ---------------------------------------------------------------------------

export type ResultadoProceso = { codigo: string | null; mensaje: string | null };

export type EstadoProtocolo = "aprobado" | "aprobado_con_observacion" | "rechazado" | "desconocido";

export type RespuestaProtocolo = {
  /** El CDC al que se refiere la respuesta. */
  cdc: string | null;
  /** Cuándo lo procesó la DNIT (dFecProc). */
  procesadoEn: Date | null;
  estado: EstadoProtocolo;
  /** El texto del estado tal como vino ("Aprobado con observación"). */
  estadoTexto: string | null;
  /** Número de transacción / protocolo de autorización (dProtAut). */
  protocoloAutorizacion: string | null;
  /** Códigos y mensajes de la DNIT (gResProc), de 1 a 100. */
  resultados: ResultadoProceso[];
};

export type RespuestaSoap =
  | { tipo: "protocolo"; protocolo: RespuestaProtocolo }
  /** El servicio contestó con un error SOAP (Fault). */
  | { tipo: "falla"; motivo: string }
  /** Lo recibido no se pudo entender como lo que se esperaba. */
  | { tipo: "ilegible"; motivo: string };

function sinAcentos(t: string): string {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Normaliza el estado que informa la DNIT: "Aprobado", "Aprobado con observación" o "Rechazado". */
export function estadoDeTexto(texto: string | null): EstadoProtocolo {
  if (!texto) return "desconocido";
  const t = sinAcentos(texto).toLowerCase().trim();
  if (t.startsWith("aprobado con observacion")) return "aprobado_con_observacion";
  if (t.startsWith("aprobado")) return "aprobado";
  if (t.startsWith("rechazado")) return "rechazado";
  return "desconocido";
}

function fechaDeProceso(texto: string | null): Date | null {
  if (!texto) return null;
  // El manual muestra "AAAA-MM-DD-hh:mm:ss"; el esquema pide fecha y hora con zona. Se acepta cualquiera de las formas.
  const normal = texto.replace(/^(\d{4}-\d{2}-\d{2})-(\d{2}:\d{2}:\d{2})/, "$1T$2");
  const d = new Date(normal);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Si el mensaje es un error SOAP (Fault), su motivo; si no, null. */
export function leerFallaSoap(raiz: ElementoXml): string | null {
  const falla = buscarElemento(raiz, "Fault");
  if (!falla) return null;
  const texto = textoDeElemento(buscarElemento(falla, "Text")) ?? textoDeElemento(buscarElemento(falla, "faultstring")) ?? textoDeElemento(buscarElemento(falla, "Value"));
  return texto ?? "El servicio devolvió un error SOAP sin detalle";
}

function protocoloDe(rProt: ElementoXml): RespuestaProtocolo {
  const estadoTexto = textoDeElemento(buscarElemento(rProt, "dEstRes"));
  return {
    cdc: textoDeElemento(buscarElemento(rProt, "Id")) ?? textoDeElemento(buscarElemento(rProt, "id")),
    procesadoEn: fechaDeProceso(textoDeElemento(buscarElemento(rProt, "dFecProc"))),
    estado: estadoDeTexto(estadoTexto),
    estadoTexto,
    protocoloAutorizacion: textoDeElemento(buscarElemento(rProt, "dProtAut")),
    resultados: hijosConNombre(rProt, "gResProc").map((g) => ({
      codigo: textoDeElemento(buscarElemento(g, "dCodRes")),
      mensaje: textoDeElemento(buscarElemento(g, "dMsgRes")),
    })),
  };
}

function leerRaiz(xml: string): { raiz: ElementoXml } | { error: string } {
  try {
    return { raiz: leerElementos(xml) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo leer la respuesta" };
  }
}

/** La respuesta de la recepción de un DE: <rRetEnviDe><rProtDe>…</rProtDe></rRetEnviDe>. */
export function leerRespuestaRecepcion(xml: string): RespuestaSoap {
  const leida = leerRaiz(xml);
  if ("error" in leida) return { tipo: "ilegible", motivo: leida.error };
  const falla = leerFallaSoap(leida.raiz);
  if (falla) return { tipo: "falla", motivo: falla };
  const rProt = buscarElemento(leida.raiz, "rProtDe");
  if (!rProt) return { tipo: "ilegible", motivo: "La respuesta no trae el protocolo de procesamiento (rProtDe)" };
  return { tipo: "protocolo", protocolo: protocoloDe(rProt) };
}

export type RespuestaConsulta =
  | {
      tipo: "consulta";
      /** 0422 = el CDC existe en la DNIT; 0420 = no existe; 0421 = el RUC del certificado no tiene permiso. */
      codigo: string | null;
      mensaje: string | null;
      procesadoEn: Date | null;
      /** Número de transacción del documento, si lo trae (solo cuando existe). */
      protocoloAutorizacion: string | null;
      existe: boolean;
    }
  | { tipo: "falla"; motivo: string }
  | { tipo: "ilegible"; motivo: string };

/** La respuesta de la consulta de un DE por CDC: <rEnviConsDeResponse>. */
export function leerRespuestaConsulta(xml: string): RespuestaConsulta {
  const leida = leerRaiz(xml);
  if ("error" in leida) return { tipo: "ilegible", motivo: leida.error };
  const falla = leerFallaSoap(leida.raiz);
  if (falla) return { tipo: "falla", motivo: falla };
  const respuesta = buscarElemento(leida.raiz, "rEnviConsDeResponse") ?? buscarElemento(leida.raiz, "rResEnviConsDe");
  if (!respuesta) return { tipo: "ilegible", motivo: "La respuesta no trae el resultado de la consulta" };
  const codigo = textoDeElemento(buscarElemento(respuesta, "dCodRes"));
  // El contenido (xContenDE) puede venir como XML o como texto con el XML adentro: el número de transacción se busca en los dos.
  let protocolo = textoDeElemento(buscarElemento(respuesta, "dProtAut"));
  if (!protocolo) {
    const contenido = textoDeElemento(buscarElemento(respuesta, "xContenDE"));
    const m = contenido ? /<(?:\w+:)?dProtAut>\s*(\d+)\s*<\/(?:\w+:)?dProtAut>/.exec(contenido) : null;
    protocolo = m ? m[1] : null;
  }
  return {
    tipo: "consulta",
    codigo,
    mensaje: textoDeElemento(buscarElemento(respuesta, "dMsgRes")),
    procesadoEn: fechaDeProceso(textoDeElemento(buscarElemento(respuesta, "dFecProc"))),
    protocoloAutorizacion: protocolo,
    existe: codigo === "0422",
  };
}

/** La respuesta del registro de un evento: <rRetEnviEventoDe> con uno o más <gResProcEVe>. */
export type RespuestaEvento =
  | { tipo: "evento"; procesadoEn: Date | null; resultados: { estado: EstadoProtocolo; estadoTexto: string | null; protocoloAutorizacion: string | null; id: string | null; codigo: string | null; mensaje: string | null }[] }
  | { tipo: "falla"; motivo: string }
  | { tipo: "ilegible"; motivo: string };

export function leerRespuestaEvento(xml: string): RespuestaEvento {
  const leida = leerRaiz(xml);
  if ("error" in leida) return { tipo: "ilegible", motivo: leida.error };
  const falla = leerFallaSoap(leida.raiz);
  if (falla) return { tipo: "falla", motivo: falla };
  const respuesta = buscarElemento(leida.raiz, "rRetEnviEventoDe");
  if (!respuesta) return { tipo: "ilegible", motivo: "La respuesta no trae el resultado del evento" };
  const grupos = hijosConNombre(respuesta, "gResProcEVe");
  if (grupos.length === 0) return { tipo: "ilegible", motivo: "La respuesta del evento no trae resultados (gResProcEVe)" };
  return {
    tipo: "evento",
    procesadoEn: fechaDeProceso(textoDeElemento(buscarElemento(respuesta, "dFecProc"))),
    resultados: grupos.map((g) => {
      const estadoTexto = textoDeElemento(buscarElemento(g, "dEstRes"));
      const proceso = buscarElemento(g, "gResProc");
      return {
        estado: estadoDeTexto(estadoTexto),
        estadoTexto,
        protocoloAutorizacion: textoDeElemento(buscarElemento(g, "dProtAut")),
        id: textoDeElemento(buscarElemento(g, "id")) ?? textoDeElemento(buscarElemento(g, "Id")),
        codigo: textoDeElemento(proceso ? buscarElemento(proceso, "dCodRes") : null),
        mensaje: textoDeElemento(proceso ? buscarElemento(proceso, "dMsgRes") : null),
      };
    }),
  };
}
