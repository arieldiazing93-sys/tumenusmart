/**
 * Categorías de gasto.
 *
 * Hay cinco fijas (las de abajo) y cada local puede crear las suyas ahí mismo,
 * al cargar un gasto (ver CategoriaGasto en el schema). Un gasto guarda en
 * `Gasto.categoria` el valor de una fija ("alquiler") o, si es una propia, su
 * NOMBRE tal cual ("Publicidad"): por eso las propias no pueden llamarse como
 * una fija (ver `resolverCategoriaNueva`).
 */

export const CATEGORIAS_GASTO = [
  { valor: "alquiler", etiqueta: "Alquiler" },
  { valor: "servicios", etiqueta: "Servicios" },
  { valor: "sueldos", etiqueta: "Sueldos" },
  { valor: "insumos", etiqueta: "Insumos" },
  { valor: "otros", etiqueta: "Otros" },
] as const;

export type OpcionCategoriaGasto = { valor: string; etiqueta: string };

/** Largo máximo del nombre de una categoría propia. */
export const MAX_LARGO_CATEGORIA_GASTO = 40;

/** Lo que se ofrece para elegir: las cinco fijas y, después, las propias del local por orden alfabético. */
export function opcionesCategoriaGasto(personalizadas: string[]): OpcionCategoriaGasto[] {
  return [
    ...CATEGORIAS_GASTO.map((c) => ({ valor: c.valor as string, etiqueta: c.etiqueta as string })),
    ...[...personalizadas]
      .sort((a, b) => a.localeCompare(b, "es"))
      .map((nombre) => ({ valor: nombre, etiqueta: nombre })),
  ];
}

/**
 * Una categoría elegida de la lista, verificada: si no es una fija ni una de
 * las propias del local, cae en "otros" (lo que llegue del navegador no se
 * guarda tal cual).
 */
export function normalizarCategoriaGasto(valor: unknown, personalizadas: string[] = []): string {
  const texto = String(valor ?? "otros");
  if (CATEGORIAS_GASTO.some((c) => c.valor === texto)) return texto;
  return personalizadas.includes(texto) ? texto : "otros";
}

/** Cómo se muestra una categoría: la etiqueta de las fijas y, en las propias, su nombre. */
export function etiquetaCategoriaGasto(valor: string): string {
  return CATEGORIAS_GASTO.find((c) => c.valor === valor)?.etiqueta ?? (valor || "Otros");
}

/**
 * Lo que se escribió como categoría nueva, resuelto contra las que ya hay:
 * si coincide (sin importar mayúsculas) con una fija o con una propia que ya
 * existe, se usa esa y no se crea otra; si no, es nueva.
 */
export function resolverCategoriaNueva(
  texto: string,
  personalizadas: string[]
): { ok: true; valor: string; esNueva: boolean } | { ok: false; error: string } {
  const nombre = texto.trim().replace(/\s+/g, " ");
  if (!nombre) return { ok: false, error: "Escribí el nombre de la categoría nueva." };
  if (nombre.length > MAX_LARGO_CATEGORIA_GASTO) {
    return { ok: false, error: `El nombre de la categoría no puede tener más de ${MAX_LARGO_CATEGORIA_GASTO} caracteres.` };
  }

  const clave = nombre.toLowerCase();
  const fija = CATEGORIAS_GASTO.find((c) => c.valor === clave || c.etiqueta.toLowerCase() === clave);
  if (fija) return { ok: true, valor: fija.valor, esNueva: false };

  const existente = personalizadas.find((p) => p.toLowerCase() === clave);
  if (existente) return { ok: true, valor: existente, esNueva: false };

  return { ok: true, valor: nombre, esNueva: true };
}
