/**
 * Deriva la paleta de marca del menú público (brand/dark/light/tinte/texto)
 * a partir de UN SOLO color que elige el dueño — el mismo esquema de 5
 * tonos que hoy tiene el naranja fijo del panel (ver tailwind.config.ts),
 * pero calculado, para que cualquier color de entrada termine con el mismo
 * "aire": un tono base, uno más oscuro para hover, uno bien pálido para
 * fondos, uno pálido intermedio, y uno oscuro con buen contraste para texto.
 *
 * Nunca hay que elegir 5 colores a mano — un dueño no sabe qué es "brand
 * tinte". Elige un color, esto arma el resto.
 */

type RGB = [number, number, number];
type HSL = [number, number, number]; // h: 0-360, s/l: 0-100

const HEX_VALIDO = /^#?[0-9a-fA-F]{6}$/;

export function esHexValido(valor: string): boolean {
  return HEX_VALIDO.test(valor.trim());
}

function hexARgb(hex: string): RGB {
  const limpio = hex.trim().replace(/^#/, "");
  const n = parseInt(limpio, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbAHsl([r, g, b]: RGB): HSL {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const delta = max - min;
  const l = (max + min) / 2;

  if (delta === 0) return [0, 0, l * 100];

  const s = delta / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === rn) h = 60 * (((gn - bn) / delta) % 6);
  else if (max === gn) h = 60 * ((bn - rn) / delta + 2);
  else h = 60 * ((rn - gn) / delta + 4);
  if (h < 0) h += 360;

  return [h, s * 100, l * 100];
}

function hslARgb([h, s, l]: HSL): RGB {
  const sn = s / 100, ln = l / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = ln - c / 2;
  let [r, g, b] = [0, 0, 0];
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

const acotar = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** "210 80 31" — el formato que espera `rgb(var(--x) / <alpha-value>)` en Tailwind. */
function comoVariable([r, g, b]: RGB): string {
  return `${r} ${g} ${b}`;
}

export type PaletaMarca = {
  brand: string;
  brandDark: string;
  brandLight: string;
  brandTinte: string;
  brandTexto: string;
};

/**
 * A partir de un hex cualquiera, arma los 5 tonos.
 *
 * El tono base se acota en luminosidad (28%-55%): ni tan oscuro que se vea
 * casi negro, ni tan claro que el texto blanco de los botones deje de
 * leerse — el mismo motivo por el que el naranja original (#D2501F) ronda el
 * 47% de luminosidad. El resto de los tonos se calculan relativos a ese
 * base, con la misma distancia que ya existe entre el naranja y sus
 * variantes actuales.
 */
export function derivarPaletaMarca(hexEntrada: string): PaletaMarca {
  const rgbEntrada = hexARgb(hexEntrada);
  const [h, sOriginal, lOriginal] = rgbAHsl(rgbEntrada);

  // Saturación mínima: un gris o casi-gris elegido a propósito (poca
  // saturación) igual necesita algo de color para que las variantes claras
  // no se vean simplemente grises.
  const s = acotar(sOriginal, 35, 90);
  const l = acotar(lOriginal, 28, 55);

  const brand = hslARgb([h, s, l]);
  const brandDark = hslARgb([h, s, acotar(l - 9, 15, 100)]);
  const brandTexto = hslARgb([h, acotar(s + 5, 0, 100), acotar(l - 13, 12, 100)]);
  // Ojo: NO baja la saturación en los tonos pálidos. Midiendo el naranja
  // original (#FCEDE6, #F7D9CB) la saturación ahí es igual o más alta que en
  // el tono base — a 88-95% de luminosidad casi cualquier saturación se ve
  // pastel igual, así que bajarla de más los dejaba grisáceos en vez de
  // pálidos con color.
  const brandLight = hslARgb([h, acotar(s, 40, 90), 95]);
  const brandTinte = hslARgb([h, acotar(s, 40, 90), 88]);

  return {
    brand: comoVariable(brand),
    brandDark: comoVariable(brandDark),
    brandLight: comoVariable(brandLight),
    brandTinte: comoVariable(brandTinte),
    brandTexto: comoVariable(brandTexto),
  };
}
