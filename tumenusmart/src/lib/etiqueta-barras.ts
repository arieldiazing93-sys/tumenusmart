import { barrasDeCodigo, medirBarras, type TipoBarras } from "./codigo-barras";

/**
 * El diseño de una etiqueta de producto (nombre, código de barras con sus números y precio) para un tamaño de papel y una impresora dados.
 *
 * Es la cuenta pura: dado el tamaño de la etiqueta y la resolución de la impresora, calcula cuánto mide cada barra (un número ENTERO de puntos
 * de la impresora, para que salgan nítidas), qué alto le queda al código después del nombre y el precio, y qué tamaño de letra usar.
 * La pantalla de etiquetas (codigos-barras/etiquetas) solo dibuja lo que esto calcula.
 */

export type FormatoDeEtiqueta = {
  id: string;
  nombre: string;
  /** Milímetros. */
  ancho: number;
  alto: number;
  /** "rollo": cada etiqueta es una hoja (impresora térmica de etiquetas). "hoja": varias etiquetas por hoja A4 (autoadhesivas). */
  tipo: "rollo" | "hoja";
  columnas?: number;
  filas?: number;
};

export const FORMATOS_DE_ETIQUETA: FormatoDeEtiqueta[] = [
  { id: "rollo-50x30", nombre: "Rollo 50 × 30 mm (térmica)", ancho: 50, alto: 30, tipo: "rollo" },
  { id: "rollo-40x25", nombre: "Rollo 40 × 25 mm (térmica)", ancho: 40, alto: 25, tipo: "rollo" },
  { id: "rollo-60x40", nombre: "Rollo 60 × 40 mm (térmica)", ancho: 60, alto: 40, tipo: "rollo" },
  { id: "a4-3x8", nombre: "Hoja A4 · 3 columnas × 8 filas (70 × 37 mm)", ancho: 70, alto: 37, tipo: "hoja", columnas: 3, filas: 8 },
  { id: "a4-5x13", nombre: "Hoja A4 · 5 columnas × 13 filas (38 × 21 mm)", ancho: 38, alto: 21, tipo: "hoja", columnas: 5, filas: 13 },
];

/** Las resoluciones de impresora que se ofrecen (puntos por pulgada). */
export const RESOLUCIONES_DE_IMPRESORA: { dpi: number; nombre: string }[] = [
  { dpi: 203, nombre: "203 ppp (impresora térmica común)" },
  { dpi: 300, nombre: "300 ppp (térmica de más resolución)" },
  { dpi: 600, nombre: "600 ppp (láser o inyección de tinta)" },
];

export const ANCHO_MINIMO_ETIQUETA_MM = 20;
export const ANCHO_MAXIMO_ETIQUETA_MM = 210;
export const ALTO_MINIMO_ETIQUETA_MM = 12;
export const ALTO_MAXIMO_ETIQUETA_MM = 150;

/** Los márgenes de papel alrededor del contenido: a los lados poco (las barras ya traen su propio margen en blanco) y arriba y abajo un poco más. */
const MARGEN_LATERAL_MM = 0.6;
const MARGEN_VERTICAL_MM = 1;
/** El alto mínimo de las barras para que un lector las encuentre con comodidad. */
const ALTO_MINIMO_BARRAS_MM = 6;
const ALTO_MAXIMO_BARRAS_MM = 18;

export type PedidoDeDiseno = {
  ancho: number;
  alto: number;
  dpi: number;
  verNombre: boolean;
  verPrecio: boolean;
  verNumeros: boolean;
  tipoBarras: TipoBarras;
};

export type DisenoDeEtiqueta =
  | {
      ok: true;
      moduloMm: number;
      /** Cuántos puntos de la impresora ocupa cada barra fina. */
      puntosPorModulo: number;
      altoBarrasMm: number;
      altoNumerosMm: number;
      tamNombreMm: number;
      lineasNombre: number;
      tamPrecioMm: number;
      margenLateralMm: number;
      margenVerticalMm: number;
      advertencias: string[];
    }
  | { ok: false; error: string };

function entre(valor: number, minimo: number, maximo: number): number {
  return Math.min(maximo, Math.max(minimo, valor));
}

export function disenarEtiqueta(pedido: PedidoDeDiseno): DisenoDeEtiqueta {
  const { ancho, alto, dpi, verNombre, verPrecio, verNumeros, tipoBarras } = pedido;
  if (!(ancho >= ANCHO_MINIMO_ETIQUETA_MM && ancho <= ANCHO_MAXIMO_ETIQUETA_MM)) {
    return { ok: false, error: `El ancho de la etiqueta tiene que estar entre ${ANCHO_MINIMO_ETIQUETA_MM} y ${ANCHO_MAXIMO_ETIQUETA_MM} mm.` };
  }
  if (!(alto >= ALTO_MINIMO_ETIQUETA_MM && alto <= ALTO_MAXIMO_ETIQUETA_MM)) {
    return { ok: false, error: `El alto de la etiqueta tiene que estar entre ${ALTO_MINIMO_ETIQUETA_MM} y ${ALTO_MAXIMO_ETIQUETA_MM} mm.` };
  }

  const medida = medirBarras(tipoBarras, ancho - 2 * MARGEN_LATERAL_MM, dpi);
  if (!medida.ok) return { ok: false, error: medida.error };

  const tamNombreMm = entre(alto * 0.095, 2.2, 3.4);
  const lineasNombre = alto >= 28 ? 2 : 1;
  const nombreAlto = verNombre ? tamNombreMm * 1.15 * lineasNombre : 0;
  const tamPrecioMm = entre(alto * 0.115, 2.8, 4.2);
  const precioAlto = verPrecio ? tamPrecioMm * 1.2 : 0;
  const altoNumerosMm = verNumeros ? entre(alto * 0.085, 2.2, 3.2) : 0;
  const elementos = [verNombre, true, verPrecio].filter(Boolean).length;
  const separaciones = (elementos - 1) * 0.4;

  const libre = alto - 2 * MARGEN_VERTICAL_MM - nombreAlto - precioAlto - separaciones - altoNumerosMm;
  const altoBarrasMm = Math.min(libre, ALTO_MAXIMO_BARRAS_MM);

  const advertencias: string[] = [];
  if (medida.advertencia) advertencias.push(medida.advertencia);
  if (altoBarrasMm < ALTO_MINIMO_BARRAS_MM) {
    return {
      ok: false,
      error: "La etiqueta es muy baja para tantas cosas: sacá el precio o el nombre, o usá una etiqueta más alta.",
    };
  }

  return {
    ok: true,
    moduloMm: medida.moduloMm,
    puntosPorModulo: medida.puntos,
    altoBarrasMm,
    altoNumerosMm,
    tamNombreMm,
    lineasNombre,
    tamPrecioMm,
    margenLateralMm: MARGEN_LATERAL_MM,
    margenVerticalMm: MARGEN_VERTICAL_MM,
    advertencias,
  };
}

/** El tipo de barras con que se imprime un código guardado, o null si no se imprime. */
export function tipoDeBarrasDe(codigo: string | null | undefined): TipoBarras | null {
  if (!codigo) return null;
  return barrasDeCodigo(codigo)?.tipo ?? null;
}

/** Cuántas etiquetas entran en una hoja de un formato "hoja" (0 si es de rollo). */
export function etiquetasPorHoja(formato: Pick<FormatoDeEtiqueta, "tipo" | "columnas" | "filas">): number {
  return formato.tipo === "hoja" ? (formato.columnas ?? 1) * (formato.filas ?? 1) : 0;
}

/**
 * Reparte las etiquetas en páginas. En un rollo, cada etiqueta es una página. En una hoja A4 entran `columnas × filas` por página, y se puede
 * empezar en la etiqueta N de la primera hoja (para aprovechar una hoja que ya se usó en parte): las primeras quedan en blanco (`null`).
 */
export function repartirEnPaginas<T>(
  etiquetas: T[],
  formato: Pick<FormatoDeEtiqueta, "tipo" | "columnas" | "filas">,
  empezarEn = 1
): (T | null)[][] {
  if (formato.tipo === "rollo") return etiquetas.map((e) => [e]);
  const porHoja = etiquetasPorHoja(formato);
  const saltear = Math.min(Math.max(0, Math.floor(empezarEn) - 1), porHoja - 1);
  const todas: (T | null)[] = [...Array<null>(saltear).fill(null), ...etiquetas];
  const paginas: (T | null)[][] = [];
  for (let i = 0; i < todas.length; i += porHoja) paginas.push(todas.slice(i, i + porHoja));
  return paginas;
}
