import type { CSSProperties } from "react";

/**
 * El encuadre de la foto de un producto.
 *
 * La carta muestra las fotos recortadas (cubren su marco: en una tarjeta ancha, en un cuadrado chico…) y por defecto se recorta
 * por el centro. Cuando la foto tiene mucho margen arriba o abajo, queda cortado lo importante. El dueño elige al cargarla qué
 * parte se ve, arrastrando la foto (como al subir la foto de perfil en Instagram): se guarda como un punto de 0 a 100 en cada
 * eje (50 = centro) y se aplica con `object-position`. No toca la imagen: es solo dónde se la mira.
 */

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

/** El estilo que se le pone a la foto para mostrar la parte elegida; undefined si no se eligió nada (queda como siempre). */
export function estiloDeFoco(x: number | null | undefined, y: number | null | undefined): CSSProperties | undefined {
  const fx = leerFoco(x);
  const fy = leerFoco(y);
  if (fx === null || fy === null) return undefined;
  return { objectPosition: `${fx}% ${fy}%` };
}
