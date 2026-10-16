/**
 * Los colores de las categorías (Mi carta → Categorías), para distinguir los grupos de un vistazo en el punto de venta: la pastilla de cada
 * grupo y las tarjetas de sus productos toman el color de su categoría.
 *
 * Es una paleta FIJA de claves (no un color libre): así el dueño nunca elige uno ilegible, el servidor solo acepta valores conocidos y el
 * mismo color se ve igual en todas las pantallas. Todos están en un tono oscuro (nivel 700 de las paletas de Tailwind): el texto blanco de
 * la pastilla elegida se lee bien sobre cualquiera, y los fondos suaves de las tarjetas salen de ese mismo tono con transparencia.
 */

import type { CSSProperties } from "react";

export const COLORES_CATEGORIA = [
  { clave: "rojo", etiqueta: "Rojo", hex: "#DC2626" },
  { clave: "naranja", etiqueta: "Naranja", hex: "#C2410C" },
  { clave: "ambar", etiqueta: "Ámbar", hex: "#B45309" },
  { clave: "lima", etiqueta: "Lima", hex: "#4D7C0F" },
  { clave: "verde", etiqueta: "Verde", hex: "#15803D" },
  { clave: "turquesa", etiqueta: "Turquesa", hex: "#0F766E" },
  { clave: "celeste", etiqueta: "Celeste", hex: "#0369A1" },
  { clave: "azul", etiqueta: "Azul", hex: "#1D4ED8" },
  { clave: "violeta", etiqueta: "Violeta", hex: "#6D28D9" },
  { clave: "rosa", etiqueta: "Rosa", hex: "#BE185D" },
  { clave: "cafe", etiqueta: "Café", hex: "#92400E" },
  { clave: "gris", etiqueta: "Gris", hex: "#475569" },
] as const;

export type ColorCategoria = (typeof COLORES_CATEGORIA)[number]["clave"];

/** ¿Es una clave de la paleta? (lo único que acepta el servidor al guardar). */
export function esColorCategoria(valor: unknown): valor is ColorCategoria {
  return typeof valor === "string" && COLORES_CATEGORIA.some((c) => c.clave === valor);
}

/** El color de esa clave; NULL si no tiene color o la clave no es de la paleta (una categoría vieja o un dato raro se ve «sin color»). */
export function colorDeCategoria(clave: string | null | undefined): (typeof COLORES_CATEGORIA)[number] | null {
  return COLORES_CATEGORIA.find((c) => c.clave === clave) ?? null;
}

/** "#1D4ED8" con una transparencia (0 a 1) → "rgba(29, 78, 216, 0.1)". */
export function conTransparencia(hex: string, alfa: number): string {
  const limpio = hex.replace("#", "");
  const n = parseInt(limpio, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alfa})`;
}

/**
 * Las variables CSS de un color, para ponerlas en `style` de un elemento y que sus clases las usen (`bg-[var(--cat-10)]`,
 * `hover:bg-[var(--cat-18)]`, `border-[var(--cat-45)]`, `bg-[var(--cat)]`). Sin color devuelve undefined: el elemento queda con sus clases de siempre.
 *
 * --cat: el color pleno · --cat-10 / --cat-18: fondos suaves (normal y al pasar el mouse) · --cat-45: bordes suaves.
 */
export function variablesDeColor(clave: string | null | undefined): CSSProperties | undefined {
  const color = colorDeCategoria(clave);
  if (!color) return undefined;
  return {
    "--cat": color.hex,
    "--cat-10": conTransparencia(color.hex, 0.1),
    "--cat-18": conTransparencia(color.hex, 0.18),
    "--cat-45": conTransparencia(color.hex, 0.45),
  } as CSSProperties;
}
