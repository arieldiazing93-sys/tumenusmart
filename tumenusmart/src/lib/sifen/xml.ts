/**
 * Armado del XML del Documento Electrónico y control contra el esquema oficial.
 *
 * El documento se trabaja como un árbol de objetos con los nombres de campo del XSD de la DNIT (DE_v150.xsd).
 * Este módulo hace dos cosas, las dos guiadas por el MISMO esquema que publica la DNIT (esquema-de.generated.ts):
 *
 *  - `aXmlDE`: escribe el XML con los campos en el orden exacto que pide el esquema (el orden importa: SIFEN
 *    rechaza un documento con los campos cambiados de lugar).
 *  - `validarContraEsquema`: revisa el árbol campo por campo (que no falte ninguno obligatorio, que no sobre ni se
 *    repita de más, y que cada valor cumpla su formato, largo, rango y lista de valores).
 *
 * Los atributos van con el prefijo "@" ("@Id" es el atributo Id del elemento DE). La firma digital (ds:Signature)
 * se inserta como texto ya armado: se genera en otro paso, después de este.
 *
 * Sin dependencias externas: corre igual en el servidor, en el navegador y en las pruebas.
 */

import { COMPLEJOS, SIMPLES, type SimpleXsd } from "./esquema-de.generated";

export type Valor = string | number | boolean | Nodo | Valor[] | null | undefined;
export interface Nodo {
  [clave: string]: Valor;
}

export const NAMESPACE_SIFEN = "http://ekuatia.set.gov.py/sifen/xsd";
const NAMESPACE_XSI = "http://www.w3.org/2001/XMLSchema-instance";

// ---------------------------------------------------------------------------
//  Texto de los valores
// ---------------------------------------------------------------------------

/** Un número como lo quiere XML: sin notación científica y sin ceros de sobra. */
export function numeroATexto(n: number): string {
  if (!Number.isFinite(n)) throw new Error(`Número inválido para el documento: ${n}`);
  const texto = String(n);
  if (!/e/i.test(texto)) return texto;
  return n.toFixed(8).replace(/0+$/, "").replace(/\.$/, "");
}

export function textoDeValor(v: string | number | boolean): string {
  return typeof v === "number" ? numeroATexto(v) : String(v);
}

function escaparTexto(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escaparAtributo(s: string): string {
  return escaparTexto(s).replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------------
//  Escribir el XML
// ---------------------------------------------------------------------------

function escribirElemento(salida: string[], nombre: string, tipo: string, valor: Valor): void {
  const complejo = COMPLEJOS[tipo];
  if (!complejo) {
    // La firma digital llega ya armada (texto XML): se inserta tal cual.
    if (tipo === "ds:Signature") {
      salida.push(String(valor));
      return;
    }
    salida.push(`<${nombre}>${escaparTexto(textoDeValor(valor as string | number | boolean))}</${nombre}>`);
    return;
  }
  const nodo = valor as Nodo;
  let atributos = "";
  for (const a of complejo.attr ?? []) {
    const v = nodo["@" + a.n];
    if (v !== undefined && v !== null) atributos += ` ${a.n}="${escaparAtributo(textoDeValor(v as string | number | boolean))}"`;
  }
  salida.push(`<${nombre}${atributos}>`);
  for (const el of complejo.el) {
    const v = nodo[el.n];
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) for (const x of v) escribirElemento(salida, el.n, el.t, x);
    else escribirElemento(salida, el.n, el.t, v);
  }
  salida.push(`</${nombre}>`);
}

/** Solo el elemento <DE Id="…">…</DE> (lo que se firma). */
export function aXmlDE(de: Nodo): string {
  const salida: string[] = [];
  escribirElemento(salida, "DE", "tDE", de);
  return salida.join("");
}

/**
 * El archivo completo del documento: declaración XML, <rDE> con su espacio de nombres y los campos en orden.
 * `rde` es el árbol { dVerFor, DE, Signature?, gCamFuFD? }.
 */
export function aXmlRDE(rde: Nodo): string {
  const salida: string[] = ['<?xml version="1.0" encoding="UTF-8"?>'];
  salida.push(
    `<rDE xmlns="${NAMESPACE_SIFEN}" xmlns:xsi="${NAMESPACE_XSI}" xsi:schemaLocation="${NAMESPACE_SIFEN} siRecepDE_v150.xsd">`
  );
  for (const el of COMPLEJOS["rDE"].el) {
    const v = rde[el.n];
    if (v === undefined || v === null) continue;
    escribirElemento(salida, el.n, el.t, v);
  }
  salida.push("</rDE>");
  return salida.join("");
}

// ---------------------------------------------------------------------------
//  Controlar contra el esquema
// ---------------------------------------------------------------------------

export type ErrorEsquema = { ruta: string; mensaje: string };

const SIN_ESPACIOS_RAROS = /^[^\n\r\t]*$/;

function cumpleBaseIncorporada(base: string, texto: string): string | null {
  switch (base) {
    case "xs:integer":
    case "xs:long":
    case "xs:int":
      return /^[+-]?\d+$/.test(texto) ? null : "tiene que ser un número entero";
    case "xs:positiveInteger":
      return /^\+?\d+$/.test(texto) && Number(texto) >= 1 ? null : "tiene que ser un entero positivo";
    case "xs:nonNegativeInteger":
      return /^\+?\d+$/.test(texto) ? null : "tiene que ser un entero no negativo";
    case "xs:decimal":
      return /^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(texto) ? null : "tiene que ser un número decimal";
    case "xs:date":
      return /^\d{4}-\d{2}-\d{2}$/.test(texto) ? null : "tiene que ser una fecha AAAA-MM-DD";
    case "xs:dateTime":
      return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/.test(texto)
        ? null
        : "tiene que ser fecha y hora AAAA-MM-DDThh:mm:ss";
    case "xs:normalizedString":
      return SIN_ESPACIOS_RAROS.test(texto) ? null : "no puede tener saltos de línea ni tabulaciones";
    default:
      // xs:string, xs:anyType y lo que no se controla.
      return null;
  }
}

function esNumerica(base: string | undefined): boolean {
  return base === "xs:integer" || base === "xs:positiveInteger" || base === "xs:nonNegativeInteger" || base === "xs:decimal" || base === "xs:int" || base === "xs:long";
}

/** La base "final" (integer, decimal, string…) de un tipo, siguiendo la cadena de tipos derivados. */
function baseFinal(def: SimpleXsd): string | undefined {
  let actual: SimpleXsd | undefined = def;
  for (let i = 0; i < 10 && actual; i++) {
    const b: string | undefined = actual.base;
    if (!b) return undefined;
    if (b.startsWith("xs:")) return b;
    actual = SIMPLES[b];
  }
  return undefined;
}

/** Cantidad de dígitos en total y decimales, sin contar ceros de relleno (como lo cuenta XML Schema). */
function contarDigitos(texto: string): { total: number; decimales: number } {
  const limpio = texto.replace(/^[+-]/, "");
  const [entera, decimal = ""] = limpio.split(".");
  const e = entera.replace(/^0+/, "");
  const d = decimal.replace(/0+$/, "");
  return { total: e.length + d.length, decimales: d.length };
}

function validarDefinicion(def: SimpleXsd, texto: string): string | null {
  if (def.union) {
    const motivos: string[] = [];
    for (const miembro of def.union) {
      const m = validarDefinicion(miembro, texto);
      if (m === null) return null;
      motivos.push(m);
    }
    return motivos[0] ?? "no cumple ninguna de las alternativas del esquema";
  }

  if (def.base) {
    const m = def.base.startsWith("xs:") ? cumpleBaseIncorporada(def.base, texto) : validarSimple(def.base, texto);
    if (m !== null) return m;
  }

  const base = baseFinal(def);
  const numerica = esNumerica(base);

  if (def.enum) {
    const ok = numerica ? def.enum.some((e) => Number(e) === Number(texto)) : def.enum.includes(texto);
    if (!ok) return `el valor "${texto}" no está entre los permitidos (${def.enum.slice(0, 8).join(", ")}${def.enum.length > 8 ? "…" : ""})`;
  }

  if (def.pat && !def.pat.some((p) => new RegExp("^(?:" + p + ")$").test(texto))) {
    return `"${texto.length > 60 ? texto.slice(0, 60) + "…" : texto}" no tiene el formato que pide el esquema`;
  }

  const largo = Array.from(texto).length;
  if (def.len !== undefined && largo !== def.len) return `tiene que tener exactamente ${def.len} caracteres (tiene ${largo})`;
  if (def.minLen !== undefined && largo < def.minLen) return `tiene que tener al menos ${def.minLen} caracteres (tiene ${largo})`;
  if (def.maxLen !== undefined && largo > def.maxLen) return `puede tener como máximo ${def.maxLen} caracteres (tiene ${largo})`;

  if (numerica) {
    const { total, decimales } = contarDigitos(texto);
    if (def.total !== undefined && total > def.total) return `tiene más de ${def.total} dígitos en total`;
    if (def.frac !== undefined && decimales > def.frac) return `tiene más de ${def.frac} decimales`;
  }

  const comparar = (limite: number | string, cmp: (a: number, b: number) => boolean, cmpTexto: (a: string, b: string) => boolean): boolean =>
    typeof limite === "number" ? cmp(Number(texto), limite) : cmpTexto(texto, limite);
  if (def.minInc !== undefined && !comparar(def.minInc, (a, b) => a >= b, (a, b) => a >= b)) return `no puede ser menor que ${def.minInc}`;
  if (def.maxInc !== undefined && !comparar(def.maxInc, (a, b) => a <= b, (a, b) => a <= b)) return `no puede ser mayor que ${def.maxInc}`;
  if (def.minExc !== undefined && !comparar(def.minExc, (a, b) => a > b, (a, b) => a > b)) return `tiene que ser mayor que ${def.minExc}`;
  if (def.maxExc !== undefined && !comparar(def.maxExc, (a, b) => a < b, (a, b) => a < b)) return `tiene que ser menor que ${def.maxExc}`;

  return null;
}

/** Controla un texto contra un tipo simple (por nombre) y devuelve el motivo del rechazo, o null si cumple. */
export function validarSimple(tipo: string, texto: string): string | null {
  if (tipo.startsWith("xs:")) return cumpleBaseIncorporada(tipo, texto);
  const def = SIMPLES[tipo];
  if (!def) return `tipo desconocido en el esquema: ${tipo}`;
  return validarDefinicion(def, texto);
}

function validarElemento(errores: ErrorEsquema[], ruta: string, tipo: string, valor: Valor, opciones: OpcionesValidacion): void {
  const complejo = COMPLEJOS[tipo];
  if (!complejo) {
    if (tipo === "ds:Signature") return;
    if (valor === null || valor === undefined || typeof valor === "object") {
      errores.push({ ruta, mensaje: "tiene que ser un valor simple" });
      return;
    }
    const m = validarSimple(tipo, textoDeValor(valor));
    if (m !== null) errores.push({ ruta, mensaje: m });
    return;
  }

  if (valor === null || typeof valor !== "object" || Array.isArray(valor)) {
    errores.push({ ruta, mensaje: "tiene que ser un grupo de campos" });
    return;
  }
  const nodo = valor as Nodo;
  const conocidos = new Set(complejo.el.map((e) => e.n));

  for (const clave of Object.keys(nodo)) {
    if (clave.startsWith("@")) continue;
    if (!conocidos.has(clave)) errores.push({ ruta: `${ruta}/${clave}`, mensaje: "no existe en el esquema de la DNIT" });
  }

  for (const a of complejo.attr ?? []) {
    const v = nodo["@" + a.n];
    if (v === undefined || v === null) {
      if (a.req) errores.push({ ruta: `${ruta}/@${a.n}`, mensaje: "falta (es obligatorio)" });
    } else {
      const m = validarSimple(a.t, textoDeValor(v as string | number | boolean));
      if (m !== null) errores.push({ ruta: `${ruta}/@${a.n}`, mensaje: m });
    }
  }

  for (const el of complejo.el) {
    const v = nodo[el.n];
    const items: Valor[] = v === undefined || v === null ? [] : Array.isArray(v) ? v : [v];
    const rutaCampo = `${ruta}/${el.n}`;
    // Sin firma tampoco hay QR: el QR lleva el DigestValue de la firma.
    if ((el.n === "Signature" || el.n === "gCamFuFD") && opciones.sinFirma) continue;
    if (items.length < el.min) {
      errores.push({ ruta: rutaCampo, mensaje: "falta (es obligatorio)" });
      continue;
    }
    if (el.max !== -1 && items.length > el.max) {
      errores.push({ ruta: rutaCampo, mensaje: `aparece ${items.length} veces y puede aparecer ${el.max}` });
    }
    items.forEach((item, i) => {
      validarElemento(errores, items.length > 1 || el.max !== 1 ? `${rutaCampo}[${i + 1}]` : rutaCampo, el.t, item, opciones);
    });
  }
}

export type OpcionesValidacion = {
  /** Todavía no se firmó: no se exige <Signature>. */
  sinFirma?: boolean;
};

/**
 * Controla el árbol del documento (rDE) contra el esquema oficial. Devuelve la lista de problemas, cada uno con
 * la ruta del campo ("/DE/gTimb/dNumTim") y qué le pasa. Lista vacía = cumple el esquema.
 */
export function validarContraEsquema(rde: Nodo, opciones: OpcionesValidacion = {}): ErrorEsquema[] {
  const errores: ErrorEsquema[] = [];
  validarElemento(errores, "/rDE", "rDE", rde, opciones);
  return errores;
}
