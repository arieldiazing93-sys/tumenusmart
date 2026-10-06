/**
 * El reconocimiento de la cara del Registro de asistencia: reglas puras (sin cámara, sin red, sin base), para que las usen
 * tanto el celular fijo como el servidor.
 *
 * Cómo funciona: el navegador convierte una cara en 128 números (su "rostro", ver src/lib/reconocimiento-cliente.ts). Dos
 * fotos de la MISMA persona dan rostros parecidos; las de personas distintas, rostros alejados. Al dar de alta a un colaborador
 * se guarda su rostro (no la imagen: son solo los 128 números). Al marcar, el celular manda el rostro de la selfie de ese
 * momento y el SERVIDOR lo compara con el guardado: si están demasiado lejos, la marcación se rechaza. La comparación se hace
 * acá y no en el celular a propósito: el rostro guardado nunca sale del servidor.
 *
 * Esto responde "¿es la misma persona del alta?", no "¿hay una persona de verdad delante de la cámara?": una foto de la persona
 * correcta mostrada a la cámara sigue pasando (para eso haría falta una prueba de vida, que se descartó para no demorar a la
 * gente).
 */

/** Cuántos números tiene el rostro de una persona. */
export const LARGO_ROSTRO = 128;

/**
 * Hasta qué distancia (euclidiana) dos rostros cuentan como la misma persona. Medido con fotos reales: la misma cara con otra
 * luz, tamaño o recorte da 0,15 a 0,40; personas distintas dan 0,52 a 0,90. El valor habitual de la librería es 0,6; se usa 0,5
 * porque acá un error deja pasar a alguien que no es. Si dejara afuera a gente de verdad con buena luz, se sube de a poco: cada
 * marcación guarda su distancia (`MarcacionAsistencia.distanciaRostro`) para poder ajustarlo con datos.
 */
export const UMBRAL_ROSTRO = 0.5;

/** Cuántas veces seguidas se le deja intentar a una persona en el celular antes de mandarla al inicio. */
export const INTENTOS_DE_ROSTRO = 3;

/** Los números de un rostro de verdad están entre -0,5 y 0,5 y su norma ronda 1,2 a 1,6: lo que salga de ahí no es un rostro. */
const VALOR_MAXIMO = 2;
const NORMA_MINIMA = 0.8;
const NORMA_MAXIMA = 2.5;

/**
 * Revisa lo que llegó del navegador y, si es un rostro posible, lo devuelve redondeado a 4 decimales (alcanza de sobra y ocupa
 * menos). Devuelve null si no es una lista de exactamente 128 números razonables. Acepta también el texto JSON de esa lista
 * (así viaja en los formularios).
 */
export function rostroValido(valor: unknown): number[] | null {
  let lista = valor;
  if (typeof lista === "string") {
    if (lista.length > 4000) return null;
    try {
      lista = JSON.parse(lista);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(lista) || lista.length !== LARGO_ROSTRO) return null;

  const rostro: number[] = [];
  let sumaDeCuadrados = 0;
  for (const v of lista) {
    if (typeof v !== "number" || !Number.isFinite(v) || Math.abs(v) > VALOR_MAXIMO) return null;
    const redondeado = Math.round(v * 10000) / 10000;
    rostro.push(redondeado);
    sumaDeCuadrados += redondeado * redondeado;
  }
  const norma = Math.sqrt(sumaDeCuadrados);
  if (norma < NORMA_MINIMA || norma > NORMA_MAXIMA) return null;
  return rostro;
}

/** ¿Tiene guardado un rostro completo? (El que no lo tiene todavía marca como antes, sin esta comprobación.) */
export function tieneRostro(guardado: readonly number[] | null | undefined): guardado is number[] {
  return Array.isArray(guardado) && guardado.length === LARGO_ROSTRO;
}

/** Qué tan lejos están dos rostros (0 = idénticos). */
export function distanciaEntreRostros(a: readonly number[], b: readonly number[]): number {
  let suma = 0;
  for (let i = 0; i < LARGO_ROSTRO; i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    suma += d * d;
  }
  return Math.sqrt(suma);
}

/** Compara el rostro guardado con el de la selfie de ahora. */
export function compararRostros(
  guardado: readonly number[],
  actual: readonly number[]
): { coincide: boolean; distancia: number } {
  const distancia = Math.round(distanciaEntreRostros(guardado, actual) * 1000) / 1000;
  return { coincide: distancia <= UMBRAL_ROSTRO, distancia };
}
