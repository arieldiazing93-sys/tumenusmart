/**
 * Mover un elemento arriba o abajo dentro de una lista.
 *
 * Está separado de la base de datos a propósito: es la parte donde es fácil
 * equivocarse (el primero, el último, la lista de uno solo) y donde el error
 * se ve recién en producción, con el dueño mirando su carta desordenada.
 * Acá se puede probar de verdad.
 */

export type Direccion = "arriba" | "abajo";

/**
 * Devuelve la lista con el elemento corrido un lugar.
 *
 * Si no se puede mover —ya está primero y quieren subirlo, o el id no está en
 * la lista— devuelve la lista IGUAL, sin romper nada. Que un botón no haga
 * nada es mucho mejor que perder el orden de una carta entera.
 */
export function moverEnLista<T>(lista: T[], indice: number, direccion: Direccion): T[] {
  const destino = direccion === "arriba" ? indice - 1 : indice + 1;
  if (indice < 0 || indice >= lista.length) return lista;
  if (destino < 0 || destino >= lista.length) return lista;

  const copia = [...lista];
  [copia[indice], copia[destino]] = [copia[destino], copia[indice]];
  return copia;
}

/**
 * Los cambios de `orden` que hay que escribir en la base.
 *
 * Reasigna 1, 2, 3... a TODA la lista y no solo a los dos que se tocaron. Eso
 * es a propósito y arregla un problema que ya existe: los productos cargados
 * hasta ahora tienen todos `orden = 0`, así que intercambiar dos valores
 * iguales no haría nada visible. Renumerando, el primer movimiento deja la
 * lista prolija para siempre.
 *
 * Solo devuelve las filas que efectivamente cambian, para no escribir de más.
 */
export function cambiosDeOrden(
  idsEnNuevoOrden: string[],
  ordenActual: Map<string, number>
): { id: string; orden: number }[] {
  const cambios: { id: string; orden: number }[] = [];
  idsEnNuevoOrden.forEach((id, i) => {
    const nuevo = i + 1;
    if (ordenActual.get(id) !== nuevo) cambios.push({ id, orden: nuevo });
  });
  return cambios;
}
