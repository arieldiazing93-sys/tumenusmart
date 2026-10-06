/**
 * Validación de los datos del comprador que una persona del local carga a mano para emitir una factura (el filtro de seguridad
 * de los pedidos de la carta digital: el cliente los escribe en el WhatsApp, la caja los consulta en la DNIT y los tipea acá).
 *
 * Pura (sin Prisma ni React): la pantalla la usa para avisar en vivo y el servidor la vuelve a correr — lo que llega del
 * navegador nunca se da por bueno.
 *
 * El dígito verificador del RUC se calcula con la misma cuenta que la DNIT (módulo 11, ver `calcularDvRuc`). Si no coincide
 * se frena, pero la persona puede confirmar que es el que figura en la consulta de la DNIT: así un caso raro no deja a nadie sin
 * poder facturar, y un error de tipeo (lo común) no pasa en silencio.
 */

import { SIN_REGISTRO_FISCAL, TIPOS_IDENTIFICACION_FISCAL } from "./tipo-cliente";
import { calcularDvRuc, separarRuc } from "./sifen-codigos";

export type DatosFiscalesManuales = {
  /** "con_registro": el comprador da sus datos. "sin_nombre": se factura a Consumidor Final. */
  modo: "con_registro" | "sin_nombre";
  tipoIdentificacion?: string;
  numeroIdentificacion?: string;
  razonSocial?: string;
  email?: string;
  /** El dígito verificador no coincide con el cálculo y la persona confirmó que es el de la DNIT. */
  dvConfirmado?: boolean;
};

export type DatosFiscalesValidos = {
  tipoIdentificacion: string;
  numeroIdentificacion: string;
  /** null en "Sin Nombre". */
  razonSocial: string | null;
  email: string | null;
};

export const RAZON_SOCIAL_LARGO = { minimo: 4, maximo: 120 };
export const EMAIL_LARGO_MAXIMO = 120;
const NUMERO_LARGO_MAXIMO = 30;

/** Espacios de más (inicio, fin y dobles) fuera: "  Juan   Pérez " → "Juan Pérez". */
export function limpiarTexto(texto: unknown): string {
  return String(texto ?? "").replace(/\s+/g, " ").trim();
}

/** Lo que se puede decir de un número de RUC mientras se escribe. */
export type RevisionDeRuc =
  | { estado: "vacio" }
  | { estado: "formato"; mensaje: string }
  | { estado: "dv_distinto"; esperado: number; mensaje: string }
  | { estado: "ok" };

/** "80012345-6": el número, un guion y el dígito verificador. Se revisa el formato y que el dígito coincida con el cálculo. */
export function revisarRuc(ruc: string): RevisionDeRuc {
  const limpio = ruc.trim();
  if (!limpio) return { estado: "vacio" };
  if (!/^[0-9A-Za-z]{3,12}-\d$/.test(limpio)) {
    return { estado: "formato", mensaje: "El RUC se escribe con su dígito verificador, así: 80012345-6." };
  }
  const { numero, dv } = separarRuc(limpio);
  const esperado = calcularDvRuc(numero);
  if (Number(dv) !== esperado) {
    return {
      estado: "dv_distinto",
      esperado,
      mensaje: `El dígito verificador no coincide: para ${numero} debería ser ${esperado}. Revisá el RUC en la consulta de la DNIT.`,
    };
  }
  return { estado: "ok" };
}

/** Lo que falla del número según el tipo de documento, o null si está bien (el dígito del RUC se revisa aparte). */
function errorDelNumero(tipo: string, numero: string): string | null {
  if (!numero) return "Escribí el número de documento.";
  if (numero.length > NUMERO_LARGO_MAXIMO) return "El número de documento es demasiado largo.";
  if (tipo === "cedula" && !/^\d{3,10}$/.test(numero)) return "La cédula son solo números (sin puntos).";
  if (tipo !== "ruc" && tipo !== "cedula" && !/^[0-9A-Za-z.\- ]{3,30}$/.test(numero)) {
    return "El número de documento solo puede llevar letras, números y guiones.";
  }
  return null;
}

export function validarDatosFiscales(
  d: DatosFiscalesManuales
): { ok: true; datos: DatosFiscalesValidos } | { ok: false; error: string; dvDistinto?: { esperado: number } } {
  if (d.modo === "sin_nombre") {
    return {
      ok: true,
      datos: {
        tipoIdentificacion: SIN_REGISTRO_FISCAL.tipo,
        numeroIdentificacion: SIN_REGISTRO_FISCAL.numero,
        razonSocial: null,
        email: null,
      },
    };
  }
  if (d.modo !== "con_registro") return { ok: false, error: "Elegí si la factura lleva los datos del cliente o es sin nombre." };

  const tipo = limpiarTexto(d.tipoIdentificacion);
  if (!TIPOS_IDENTIFICACION_FISCAL.some((t) => t.valor === tipo)) return { ok: false, error: "Elegí el tipo de documento." };

  const numero = limpiarTexto(d.numeroIdentificacion);
  const errorNumero = errorDelNumero(tipo, numero);
  if (errorNumero) return { ok: false, error: errorNumero };

  if (tipo === "ruc") {
    const r = revisarRuc(numero);
    if (r.estado === "formato") return { ok: false, error: r.mensaje };
    if (r.estado === "dv_distinto" && d.dvConfirmado !== true) {
      return { ok: false, error: r.mensaje, dvDistinto: { esperado: r.esperado } };
    }
  }

  const razonSocial = limpiarTexto(d.razonSocial);
  if (razonSocial.length < RAZON_SOCIAL_LARGO.minimo) {
    return { ok: false, error: `La razón social tiene que tener al menos ${RAZON_SOCIAL_LARGO.minimo} letras.` };
  }
  if (razonSocial.length > RAZON_SOCIAL_LARGO.maximo) {
    return { ok: false, error: `La razón social es demasiado larga (máximo ${RAZON_SOCIAL_LARGO.maximo} letras).` };
  }

  const email = limpiarTexto(d.email);
  if (email && (email.length > EMAIL_LARGO_MAXIMO || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    return { ok: false, error: "El correo no parece válido. Dejalo vacío si el cliente no lo dio." };
  }

  return { ok: true, datos: { tipoIdentificacion: tipo, numeroIdentificacion: numero, razonSocial, email: email || null } };
}
