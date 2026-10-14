/**
 * La cantidad que se escribe ANTES de tocar un producto en el Punto de venta: «35» (35 unidades) o «0,250» (250 g de un producto por
 * kilo). Es opcional: sin escribir nada, el producto suma de a uno como siempre.
 *
 * Lógica pura (sin pantalla): la pantalla la usa para avisar en el momento y se prueba con todos los casos que el teclado puede dar.
 * La regla que no se rompe: lo que se escribe NUNCA se interpreta distinto de lo que dice. «0.250» no es 250 unidades: es un decimal, y
 * un decimal solo vale para un producto que se vende por kilogramo o por litro.
 */

import { LIMITES_DE_CAJA } from "./precio-pedido";
import { pesoValido } from "./unidad-medida";

/** Lo más que se carga de una unidad de una vez (el servidor tiene el mismo tope: `LIMITES_DE_CAJA`). */
export const CANTIDAD_MAXIMA_EN_CAJA = LIMITES_DE_CAJA.maxCantidadPorLinea;

/**
 * Lo más que se carga de un producto por kilo (o litro) en una sola vez. Más que esto casi siempre es un error de tipeo (250 cuando
 * eran 250 g, que se escribe 0,250): se avisa en vez de cobrar 250 kilos. Para más, se carga de a varias veces.
 */
export const PESO_MAXIMO_POR_CARGA = 50;

export type CantidadEscrita =
  /** No escribió nada: el producto suma de a uno. */
  | { tipo: "vacia" }
  /** Un número entero (35): unidades, o kilos enteros si el producto es por kilo. */
  | { tipo: "entera"; valor: number }
  /** Con decimales (0,250): solo para un producto por kilogramo o litro. */
  | { tipo: "decimal"; valor: number }
  | { tipo: "invalida"; error: string };

/** Lee lo que se escribió. Acepta coma o punto como separador decimal, hasta tres decimales. */
export function leerCantidadEscrita(texto: string): CantidadEscrita {
  const t = String(texto ?? "").trim();
  if (t === "") return { tipo: "vacia" };
  if (/[^\d.,]/.test(t)) {
    return { tipo: "invalida", error: "Escribí solo números: 35, o 0,250 para 250 g." };
  }
  const separadores = (t.match(/[.,]/g) ?? []).length;
  if (separadores > 1 || !/\d/.test(t)) {
    return { tipo: "invalida", error: "Esa cantidad no se entiende. Ejemplos: 35, o 0,250 para 250 g." };
  }
  const [parteEntera, parteDecimal = ""] = t.replace(",", ".").split(".");
  if (parteDecimal.length > 3) {
    return { tipo: "invalida", error: "Hasta tres decimales: 0,250 son 250 g." };
  }
  const valor = Number(`${parteEntera === "" ? "0" : parteEntera}${parteDecimal ? "." + parteDecimal : ""}`);
  if (!Number.isFinite(valor) || valor <= 0) {
    return { tipo: "invalida", error: "La cantidad tiene que ser mayor a cero." };
  }
  if (Number.isInteger(valor)) {
    if (valor > 99999) return { tipo: "invalida", error: "Esa cantidad es demasiado grande." };
    return { tipo: "entera", valor };
  }
  if (!pesoValido(valor)) {
    return { tipo: "invalida", error: "Esa cantidad es muy chica: el mínimo es 0,001 (1 g)." };
  }
  return { tipo: "decimal", valor };
}

/** Lo que se carga al tocar un producto con la cantidad que se escribió (o sin escribir nada). */
export type CargaDeProducto =
  | { ok: true; cantidad: number; peso?: number }
  | { ok: false; error: string };

/**
 * Qué pasa al tocar un producto con esa cantidad escrita:
 *
 *  - Producto por unidad: un número entero son esas unidades (35). Un decimal NO se acepta: se avisa y no se carga nada.
 *  - Producto por kilogramo o litro: el número es lo que se pesó, en kilos o litros (0,250 = 250 g; 2 = 2 kg). Va como peso, en una
 *    sola porción.
 *  - Sin nada escrito: de a uno (1 unidad, o 1 kilo/litro), como siempre.
 */
export function cargaDeProducto(
  escrita: CantidadEscrita,
  producto: { nombre: string; porPeso: boolean }
): CargaDeProducto {
  if (escrita.tipo === "vacia") return { ok: true, cantidad: 1 };
  if (escrita.tipo === "invalida") return { ok: false, error: escrita.error };

  if (producto.porPeso) {
    if (escrita.valor > PESO_MAXIMO_POR_CARGA) {
      return {
        ok: false,
        error: `Son más de ${PESO_MAXIMO_POR_CARGA} kilos. Si querías gramos, escribí 0,250 para 250 g. Para más cantidad, cargalo de a varias veces.`,
      };
    }
    return { ok: true, cantidad: 1, peso: escrita.valor };
  }

  if (escrita.tipo === "decimal") {
    return {
      ok: false,
      error: `«${producto.nombre}» se vende por unidad: la cantidad tiene que ser un número entero. Para venderlo por peso, cambiale la unidad de medida a Kilogramo en Mi carta → Productos.`,
    };
  }
  if (escrita.valor > CANTIDAD_MAXIMA_EN_CAJA) {
    return { ok: false, error: `Hasta ${CANTIDAD_MAXIMA_EN_CAJA} unidades de una vez.` };
  }
  return { ok: true, cantidad: escrita.valor };
}

/** Suma lo pesado: dos pesos con hasta tres decimales dan un peso con hasta tres decimales (sin arrastrar errores de coma flotante). */
export function sumarPesos(a: number, b: number): number {
  return Math.round((Math.round(a * 1000) + Math.round(b * 1000))) / 1000;
}

/** Lo mínimo que tiene que tener una línea para juntarse con otra igual (la misma clave): su cantidad y, si se pesó, el peso. */
export type LineaConPeso = { key: string; cantidad: number; peso?: number };

/**
 * Suma lo que se acaba de cargar (`nuevo`: con su cantidad y, si es un producto por kilo o litro, su peso) a la lista de lo que ya se
 * cargó. Si ya hay una línea con la misma clave:
 *  - sin peso, se suma la cantidad (hasta el tope de la caja);
 *  - con peso, lo pesado se JUNTA en una sola línea (lo que ya había + lo nuevo, siempre una porción): dos veces 0,250 son 0,500.
 * Devuelve un aviso si una línea pasaría del peso máximo. No toca la lista que recibe.
 */
export function sumarCargaALista<T extends LineaConPeso>(
  lista: T[],
  nuevo: T
): { ok: true; lista: T[] } | { ok: false; error: string } {
  const i = lista.findIndex((x) => x.key === nuevo.key);
  if (i < 0) return { ok: true, lista: [...lista, nuevo] };
  const existente = lista[i];
  if (nuevo.peso !== undefined) {
    const yaPesado = existente.peso !== undefined ? (Math.round(existente.peso * 1000) * existente.cantidad) / 1000 : existente.cantidad;
    const suma = sumarPesos(yaPesado, nuevo.peso);
    if (!pesoValido(suma)) return { ok: false, error: "Esa línea pasaría del peso máximo (999 kilos). Cargalo aparte." };
    return { ok: true, lista: lista.map((x, k) => (k === i ? { ...x, cantidad: 1, peso: suma } : x)) };
  }
  const cantidad = Math.min(existente.cantidad + nuevo.cantidad, CANTIDAD_MAXIMA_EN_CAJA);
  return { ok: true, lista: lista.map((x, k) => (k === i ? { ...x, cantidad } : x)) };
}
