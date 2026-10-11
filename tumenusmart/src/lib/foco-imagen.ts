import type { CSSProperties } from "react";

/**
 * El encuadre de la foto de un producto.
 *
 * La carta muestra las fotos recortadas (cubren su marco: en una tarjeta ancha, en un cuadrado chico…) y por defecto se recorta
 * por el centro. Cuando la foto tiene mucho margen arriba o abajo, queda cortado lo importante. El dueño elige al cargarla qué
 * parte se ve, arrastrando la foto (como al subir la foto de perfil en Instagram), y puede acercarla para tener lugar donde
 * moverla (una foto que entra justa en su marco no se puede mover sin acercarla).
 *
 * Se guarda como un punto de 0 a 100 en cada eje (50 = centro) y un acercamiento de 100 a 300 (100 = sin acercar). Se aplica con
 * `object-position` y `transform: scale` sobre el mismo punto, así el punto elegido no se mueve al acercar. No toca la imagen:
 * es solo dónde y cómo se la mira. Quien la muestre tiene que recortar lo que sobra (`overflow: hidden` en el contenedor).
 */

export const ZOOM_MINIMO = 100;
export const ZOOM_MAXIMO = 300;

/** Un valor de encuadre (de un formulario o de la base) a un entero de 0 a 100; null si no hay o no es un número. */
export function leerFoco(valor: unknown): number | null {
  if (valor === null || valor === undefined) return null;
  const texto = String(valor).trim();
  if (texto === "") return null;
  const n = Number(texto);
  if (!Number.isFinite(n)) return null;
  return Math.min(100, Math.max(0, Math.round(n)));
}

/** El par (x, y) de un formulario: los dos o ninguno (con uno solo no se sabe qué encuadre quiso). */
export function leerEncuadre(x: unknown, y: unknown): { x: number | null; y: number | null } {
  const fx = leerFoco(x);
  const fy = leerFoco(y);
  return fx !== null && fy !== null ? { x: fx, y: fy } : { x: null, y: null };
}

/** El acercamiento (de un formulario o de la base): un entero de 100 a 300; null si no hay, no es un número o no acerca nada. */
export function leerZoom(valor: unknown): number | null {
  if (valor === null || valor === undefined) return null;
  const texto = String(valor).trim();
  if (texto === "") return null;
  const n = Number(texto);
  if (!Number.isFinite(n)) return null;
  const z = Math.min(ZOOM_MAXIMO, Math.max(ZOOM_MINIMO, Math.round(n)));
  return z > ZOOM_MINIMO ? z : null;
}

/**
 * El estilo que se le pone a la foto para mostrar la parte elegida; undefined si no se eligió nada (queda como siempre).
 * Con acercamiento, el mismo punto es el centro del acercamiento: lo que el dueño dejó a la vista no se corre al acercar.
 */
export function estiloDeFoco(
  x: number | null | undefined,
  y: number | null | undefined,
  zoom?: number | null
): CSSProperties | undefined {
  const fx = leerFoco(x);
  const fy = leerFoco(y);
  const z = leerZoom(zoom);
  // Con acercamiento y sin punto, se acerca por el centro.
  if (fx === null || fy === null) {
    return z === null ? undefined : { objectPosition: "50% 50%", transform: `scale(${z / 100})`, transformOrigin: "50% 50%" };
  }
  const base: CSSProperties = { objectPosition: `${fx}% ${fy}%` };
  if (z === null) return base;
  return { ...base, transform: `scale(${z / 100})`, transformOrigin: `${fx}% ${fy}%` };
}
