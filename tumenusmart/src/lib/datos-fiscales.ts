/**
 * Validación de los datos del comprador que una persona del local carga a mano para emitir una factura (el filtro de seguridad
 * de los pedidos de la carta digital: el cliente los escribe en el WhatsApp, la caja los compara en la DNIT y los tipea acá).
 *
 * Pura (sin Prisma ni React): la pantalla la usa para avisar a tiempo y el servidor la vuelve a correr — lo que llega del
 * navegador nunca se da por bueno.
 *
 * NO verifica los datos contra la DNIT ni calcula el dígito verificador del RUC: esa comparación la hace la caja en la página de
 * la DNIT antes de cargar nada (y lo resuelve con el cliente por WhatsApp o por llamada). Acá solo se revisa lo mínimo para que la
 * factura salga completa: que el número tenga la forma correcta (el RUC con su dígito: 80012345-6, que la factura electrónica
 * exige), una razón social de al menos 4 letras (SIFEN) y un correo con forma de correo.
 */

import { SIN_REGISTRO_FISCAL, TIPOS_IDENTIFICACION_FISCAL } from "./tipo-cliente";

export type DatosFiscalesManuales = {
  /** "con_registro": el comprador da sus datos. "sin_nombre": se factura a Consumidor Final. */
  modo: "con_registro" | "sin_nombre";
  tipoIdentificacion?: string;
  numeroIdentificacion?: string;
  razonSocial?: string;
  email?: string;
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

/** Lo que falla del número según el tipo de documento, o null si está bien. */
function errorDelNumero(tipo: string, numero: string): string | null {
  if (!numero) return "Escribí el número de documento.";
  if (numero.length > NUMERO_LARGO_MAXIMO) return "El número de documento es demasiado largo.";
  if (tipo === "ruc" && !/^[0-9A-Za-z]{3,12}-\d$/.test(numero)) {
    return "El RUC se escribe con su dígito verificador, así: 80012345-6.";
  }
  if (tipo === "cedula" && !/^\d{3,10}$/.test(numero)) return "La cédula son solo números (sin puntos).";
  if (tipo !== "ruc" && tipo !== "cedula" && !/^[0-9A-Za-z.\- ]{3,30}$/.test(numero)) {
    return "El número de documento solo puede llevar letras, números y guiones.";
  }
  return null;
}

export function validarDatosFiscales(
  d: DatosFiscalesManuales
): { ok: true; datos: DatosFiscalesValidos } | { ok: false; error: string } {
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
  if (d.modo !== "con_registro") return { ok: false, error: "Elegí si la factura es con registro fiscal o sin registro fiscal." };

  const tipo = limpiarTexto(d.tipoIdentificacion);
  if (!TIPOS_IDENTIFICACION_FISCAL.some((t) => t.valor === tipo)) return { ok: false, error: "Elegí el tipo de documento." };

  const numero = limpiarTexto(d.numeroIdentificacion);
  const errorNumero = errorDelNumero(tipo, numero);
  if (errorNumero) return { ok: false, error: errorNumero };

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
