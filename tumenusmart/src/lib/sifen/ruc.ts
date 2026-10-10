/**
 * La verificación de un RUC contra la DNIT: qué se consulta y cómo se traduce lo que contesta a algo que el cajero entienda.
 *
 * Fuente: Manual Técnico v150, 9.6 (WS siConsRUC y su tabla H de resultados) y las validaciones del documento electrónico que la
 * DNIT aplica al receptor (capítulo 12):
 *   1306  el RUC del receptor tiene que existir en la base de Marangatú                       → la DNIT RECHAZA el documento
 *   1307  si el receptor es persona jurídica, su RUC no puede estar CANCELADO, CANCELADO DEFINITIVO ni SUSPENSIÓN TEMPORAL
 *   1308  en operaciones B2B y B2G, igual (y todo comprador con RUC va como B2B: ver armar-de.ts)
 *   1309  el dígito verificador tiene que cumplir el módulo 11
 * Avisarlo cuando el cajero carga el RUC evita emitir una factura que la DNIT va a rechazar.
 *
 * Es puro (sin red ni base de datos) y no importa nada pesado: lo usan el servidor y también las pantallas (el tipo).
 */

import { calcularDvRuc } from "../sifen-codigos";

/** Los estados de un RUC que informa la DNIT (Manual 9.6.3, ContenedorRUC: dCodEstCons). */
export const ESTADOS_RUC: Record<string, string> = {
  ACT: "Activo",
  SUS: "Suspensión temporal",
  SAD: "Suspensión administrativa",
  BLQ: "Bloqueado",
  CAN: "Cancelado",
  CDE: "Cancelado definitivo",
};

/** Con estos estados la DNIT rechaza la factura (validaciones 1307 y 1308). Los demás (SAD, BLQ) no están en esa lista: solo se avisan. */
const ESTADOS_QUE_RECHAZA_LA_DNIT = new Set(["CAN", "CDE", "SUS"]);

export type VerificacionRuc = {
  resultado: "encontrado" | "no_existe" | "digito_incorrecto" | "no_consultable" | "no_disponible";
  /** ok = verificado; aviso = revisar; error = no se puede facturar así; info = no se pudo verificar (se sigue con el control del dígito). */
  nivel: "ok" | "aviso" | "error" | "info";
  /** ¿Hay que impedir facturar con este RUC? Solo cuando la DNIT (o el módulo 11) lo va a rechazar. */
  bloquea: boolean;
  /** El texto para el cajero. null = no mostrar nada (por ejemplo, el local no factura electrónico y no hay con qué consultar). */
  mensaje: string | null;
  /** El RUC con su dígito verificador (80012345-0): el que figura en la DNIT o el que corresponde. */
  rucCompleto: string | null;
  /** El nombre o razón social tal como figura en la DNIT. */
  razonSocial: string | null;
  /** ACT, SUS, SAD, BLQ, CAN o CDE. */
  estadoCodigo: string | null;
  /** ¿Es facturador electrónico? null = la DNIT no lo informó. */
  facturadorElectronico: boolean | null;
};

const base: VerificacionRuc = {
  resultado: "no_disponible",
  nivel: "info",
  bloquea: false,
  mensaje: null,
  rucCompleto: null,
  razonSocial: null,
  estadoCodigo: null,
  facturadorElectronico: null,
};

export const verificacion = (datos: Partial<VerificacionRuc> & Pick<VerificacionRuc, "resultado" | "nivel">): VerificacionRuc => ({ ...base, ...datos });

/**
 * ¿Lo escrito tiene la forma de un RUC completo (número y dígito verificador, «80012345-0»)? Las pantallas lo usan para
 * verificarlo solas en cuanto el cajero termina de escribirlo, sin molestar mientras tipea.
 */
export function pareceRucConDigito(numero: string): boolean {
  return /^[1-9]\d{4,7}-\d$/.test(numero.trim());
}

export type ConsultaPreparada =
  | { ok: true; /** El RUC sin dígito verificador, como lo pide el servicio. */ numero: string; dvInformado: number | null; dvCorrecto: number }
  | { ok: false; verificacion: VerificacionRuc };

/**
 * Revisa lo que escribió el cajero antes de ir a la DNIT: forma del número y dígito verificador. El servicio pide el RUC sin el
 * dígito, de 5 a 8 caracteres (Manual 9.6.1, esquema tRuc); si el dígito está mal ni se consulta.
 */
export function prepararConsultaRuc(entrada: string): ConsultaPreparada {
  const limpio = entrada.replace(/\s+/g, "").toUpperCase();
  const noConsultable = (mensaje: string): ConsultaPreparada => ({ ok: false, verificacion: verificacion({ resultado: "no_consultable", nivel: "info", mensaje }) });
  const partes = limpio.split("-");
  if (!limpio || partes.length > 2) return noConsultable("Escribí el RUC con su dígito verificador, por ejemplo 80012345-0.");
  const numero = partes[0];
  if (!/^[1-9][0-9]*[0-9A-D]?$/.test(numero) || numero.length < 5 || numero.length > 8) {
    return noConsultable("Para verificar en la DNIT, el RUC tiene que tener entre 5 y 8 dígitos (por ejemplo 80012345-0).");
  }
  let dvInformado: number | null = null;
  if (partes.length === 2) {
    if (!/^\d$/.test(partes[1])) return noConsultable("El dígito verificador es un solo número (por ejemplo 80012345-0).");
    dvInformado = Number(partes[1]);
  }
  const dvCorrecto = calcularDvRuc(numero);
  if (dvInformado !== null && dvInformado !== dvCorrecto) {
    return {
      ok: false,
      verificacion: verificacion({
        resultado: "digito_incorrecto",
        nivel: "error",
        bloquea: true,
        mensaje: `El dígito verificador no coincide: el RUC ${numero} lleva ${dvCorrecto}, no ${dvInformado}. Revisá el número.`,
        rucCompleto: `${numero}-${dvCorrecto}`,
      }),
    };
  }
  return { ok: true, numero, dvInformado, dvCorrecto };
}

/** Lo que dijo la DNIT, ya leído de su XML (ver `leerRespuestaConsultaRuc` en ws.ts). */
export type ContestacionRuc =
  | { tipo: "consulta"; codigo: string | null; mensaje: string | null; contenido: { ruc: string | null; razonSocial: string | null; estadoCodigo: string | null; estadoTexto: string | null; facturadorElectronico: boolean | null } | null }
  | { tipo: "falla"; motivo: string }
  | { tipo: "ilegible"; motivo: string };

/** Traduce la respuesta de la DNIT a lo que se le muestra al cajero. `consultado` es lo que salió de `prepararConsultaRuc`. */
export function interpretarRespuestaRuc(r: ContestacionRuc, consultado: { numero: string; dvCorrecto: number }): VerificacionRuc {
  const completo = `${consultado.numero}-${consultado.dvCorrecto}`;
  if (r.tipo !== "consulta") {
    return verificacion({
      resultado: "no_disponible",
      nivel: "info",
      mensaje: `No se pudo consultar a la DNIT (${r.motivo.slice(0, 160)}). Se controló solo el dígito verificador.`,
    });
  }
  if (r.codigo === "0500") {
    return verificacion({
      resultado: "no_existe",
      nivel: "error",
      bloquea: true,
      mensaje: "Ese RUC no existe en la DNIT: una factura a ese RUC sería rechazada. Revisá el número o facturá sin registro fiscal.",
    });
  }
  if (r.codigo === "0501") {
    return verificacion({
      resultado: "no_disponible",
      nivel: "info",
      mensaje: "El RUC de tu certificado todavía no tiene permiso para consultar RUC en la DNIT. Se controló solo el dígito verificador.",
    });
  }
  if (r.codigo !== "0502" || !r.contenido) {
    return verificacion({
      resultado: "no_disponible",
      nivel: "info",
      mensaje: `La DNIT contestó ${r.codigo ?? "sin código"}${r.mensaje ? ` (${r.mensaje.slice(0, 120)})` : ""}. Se controló solo el dígito verificador.`,
    });
  }
  const c = r.contenido;
  if (c.ruc && c.ruc.toUpperCase() !== consultado.numero) {
    return verificacion({ resultado: "no_disponible", nivel: "info", mensaje: "La DNIT contestó por otro RUC: se ignoró la respuesta. Se controló solo el dígito verificador." });
  }
  const estadoCodigo = c.estadoCodigo ? c.estadoCodigo.toUpperCase() : null;
  const estadoTexto = (estadoCodigo ? ESTADOS_RUC[estadoCodigo] : null) ?? c.estadoTexto ?? "sin estado";
  const razonSocial = c.razonSocial ? c.razonSocial.replace(/\s+/g, " ").trim() : null;
  const comunes = { resultado: "encontrado" as const, rucCompleto: completo, razonSocial, estadoCodigo, facturadorElectronico: c.facturadorElectronico };
  if (estadoCodigo && ESTADOS_QUE_RECHAZA_LA_DNIT.has(estadoCodigo)) {
    return verificacion({
      ...comunes,
      nivel: "error",
      bloquea: true,
      mensaje: `El RUC figura como «${estadoTexto}» en la DNIT: las facturas a un RUC en ese estado son rechazadas. Pedile al cliente otro dato o facturá sin registro fiscal.`,
    });
  }
  if (estadoCodigo !== "ACT") {
    return verificacion({
      ...comunes,
      nivel: "aviso",
      mensaje: `El RUC figura como «${estadoTexto}» en la DNIT. Revisalo con el cliente antes de facturar.`,
    });
  }
  return verificacion({ ...comunes, nivel: "ok", mensaje: "Verificado en la DNIT · RUC activo" });
}
