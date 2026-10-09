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

/**
 * XML 1.0 no admite los caracteres de control ni las parejas de sustitución sueltas, y un retorno de carro se convierte
 * en salto de línea al leer el archivo. Como la firma digital se calcula sobre el texto exacto, hay que dejar el texto
 * como quedaría después de leerlo: si no, quien verifica obtiene bytes distintos y la firma "se rompe".
 */
export function limpiarTextoXml(s: string): string {
  const sinControl = s.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "");
  let salida = "";
  for (let i = 0; i < sinControl.length; i++) {
    const c = sinControl.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const siguiente = sinControl.charCodeAt(i + 1);
      if (siguiente >= 0xdc00 && siguiente <= 0xdfff) {
        salida += sinControl[i] + sinControl[i + 1];
        i++;
      }
      // una mitad suelta se descarta
    } else if (c < 0xdc00 || c > 0xdfff) {
      salida += sinControl[i];
    }
  }
  return salida;
}

function escaparTexto(s: string): string {
  return limpiarTextoXml(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** El texto de un valor listo para ir dentro de una etiqueta (sin caracteres de control, con &, < y > escapados). */
export function escaparTextoXml(s: string): string {
  return escaparTexto(s);
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

// ---------------------------------------------------------------------------
//  Leer el XML (el camino inverso de aXmlRDE)
// ---------------------------------------------------------------------------

export type ElementoXml = {
  nombre: string;
  atributos: Record<string, string>;
  hijos: ElementoXml[];
  texto: string;
  /** Dónde empieza y termina el elemento (con sus etiquetas) en el texto original. */
  desde: number;
  hasta: number;
};

function desescapar(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (_m, e: string) => {
    if (e === "amp") return "&";
    if (e === "lt") return "<";
    if (e === "gt") return ">";
    if (e === "quot") return '"';
    if (e === "apos") return "'";
    return String.fromCodePoint(e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
  });
}

/**
 * Un lector de XML mínimo, para los archivos que escribe este mismo módulo y las respuestas de los servicios de la DNIT:
 * elementos, atributos, texto y CDATA. No admite DTD (ni entidades propias): un documento con DOCTYPE se rechaza, así no hay
 * forma de que una respuesta ajena haga leer archivos ni explotar la memoria con entidades anidadas.
 */
export function leerElementos(xml: string): ElementoXml {
  const patron = /<\?[\s\S]*?\?>|<!--[\s\S]*?-->|<\/([^\s>]+)\s*>|<([^\s/>]+)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|<!\[CDATA\[([\s\S]*?)\]\]>|([^<]+)/g;
  const raiz: ElementoXml = { nombre: "#raiz", atributos: {}, hijos: [], texto: "", desde: 0, hasta: xml.length };
  const pila: ElementoXml[] = [raiz];
  let m: RegExpExecArray | null;
  let ultimo = 0;
  while ((m = patron.exec(xml))) {
    if (m.index !== ultimo) throw new Error("El XML no se pudo leer (hay texto fuera de lugar)");
    ultimo = patron.lastIndex;
    const actual = pila[pila.length - 1];
    if (m[1] !== undefined) {
      if (pila.length === 1 || actual.nombre !== m[1]) throw new Error(`El XML no se pudo leer (se cierra <${m[1]}> sin abrirse)`);
      actual.hasta = patron.lastIndex;
      pila.pop();
    } else if (m[2] !== undefined) {
      const atributos: Record<string, string> = {};
      const reAtr = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
      let a: RegExpExecArray | null;
      while ((a = reAtr.exec(m[3] ?? ""))) atributos[a[1]] = desescapar(a[2] ?? a[3] ?? "");
      const elemento: ElementoXml = { nombre: m[2], atributos, hijos: [], texto: "", desde: m.index, hasta: patron.lastIndex };
      actual.hijos.push(elemento);
      if (m[4] !== "/") pila.push(elemento);
    } else if (m[5] !== undefined) {
      if (actual === raiz) throw new Error("El XML no se pudo leer (hay texto fuera del documento)");
      actual.texto += m[5];
    } else if (m[6] !== undefined) {
      if (actual === raiz && m[6].trim() !== "") throw new Error("El XML no se pudo leer (hay texto fuera del documento)");
      actual.texto += desescapar(m[6]);
    }
  }
  if (ultimo !== xml.length) throw new Error("El XML no se pudo leer (termina de forma inesperada)");
  if (pila.length !== 1) throw new Error(`El XML no se pudo leer (falta cerrar <${pila[pila.length - 1].nombre}>)`);
  return raiz;
}

function aNodoXml(xml: string, elemento: ElementoXml, tipo: string): Valor {
  const complejo = COMPLEJOS[tipo];
  if (!complejo) {
    // La firma digital se conserva como texto XML, tal cual está en el archivo.
    if (tipo === "ds:Signature") return xml.slice(elemento.desde, elemento.hasta);
    return elemento.texto;
  }
  const nodo: Nodo = {};
  for (const a of complejo.attr ?? []) {
    if (elemento.atributos[a.n] !== undefined) nodo["@" + a.n] = elemento.atributos[a.n];
  }
  for (const el of complejo.el) {
    const hijos = elemento.hijos.filter((h) => h.nombre === el.n);
    if (hijos.length === 0) continue;
    nodo[el.n] = el.max === 1 ? aNodoXml(xml, hijos[0], el.t) : hijos.map((h) => aNodoXml(xml, h, el.t));
  }
  return nodo;
}

/**
 * Lee un archivo <rDE> (el que escribe `aXmlRDE`) y devuelve el mismo árbol { dVerFor, DE, Signature, gCamFuFD }. Todos los
 * valores quedan como texto; la firma, como el texto XML que tenía. Sirve para armar la representación gráfica (KuDE)
 * desde el documento firmado y para verificar que lo guardado sea lo que se escribió.
 */
export function leerXmlRDE(xml: string): Nodo {
  const raiz = leerElementos(xml);
  const rde = raiz.hijos.find((h) => h.nombre === "rDE");
  if (!rde || raiz.hijos.length !== 1) throw new Error("El archivo no es un documento electrónico (<rDE>)");
  return aNodoXml(xml, rde, "rDE") as Nodo;
}

// ---------------------------------------------------------------------------
//  Ayudas para leer respuestas (SOAP y protocolos de la DNIT)
// ---------------------------------------------------------------------------

/** El nombre de una etiqueta sin su prefijo de espacio de nombres: "env:Body" → "Body". */
export function nombreLocal(nombre: string): string {
  const i = nombre.indexOf(":");
  return i >= 0 ? nombre.slice(i + 1) : nombre;
}

/** El primer elemento con ese nombre (sin prefijo) dentro de `desde`, buscando en profundidad; null si no hay. */
export function buscarElemento(desde: ElementoXml, nombre: string): ElementoXml | null {
  for (const hijo of desde.hijos) {
    if (nombreLocal(hijo.nombre) === nombre) return hijo;
    const dentro = buscarElemento(hijo, nombre);
    if (dentro) return dentro;
  }
  return null;
}

/** Todos los elementos con ese nombre (sin prefijo) que sean hijos DIRECTOS de `desde`. */
export function hijosConNombre(desde: ElementoXml, nombre: string): ElementoXml[] {
  return desde.hijos.filter((h) => nombreLocal(h.nombre) === nombre);
}

/** El texto de un elemento sin espacios en las puntas, o null si no existe o está vacío. */
export function textoDeElemento(el: ElementoXml | null | undefined): string | null {
  const t = el?.texto.trim();
  return t ? t : null;
}
