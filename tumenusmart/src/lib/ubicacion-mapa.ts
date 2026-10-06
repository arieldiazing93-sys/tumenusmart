/**
 * La ubicación del cliente que llega por WhatsApp. El menú digital manda en el mensaje un enlace de Google Maps con el punto que
 * el cliente marcó (`https://www.google.com/maps?q=-25.3,-57.6`), y la caja lo copia y lo pega tal cual en la dirección del pedido.
 * Acá se lo reconoce: se sacan las coordenadas (para que el repartidor abra el mapa con un toque) y se muestra el enlace como
 * enlace en vez de un texto larguísimo.
 *
 * Pura (sin servidor ni navegador): la usan la pantalla de carga, el servidor y las pantallas del pedido y del repartidor.
 */

export type Ubicacion = { lat: number; lng: number };

const NUMERO = "-?\\d{1,3}(?:\\.\\d+)?";

// Los formatos de enlace de Google Maps que se ven en la práctica, del más habitual (el de nuestro mensaje) al menos.
const PATRONES: RegExp[] = [
  // maps?q=-25.3,-57.6 · ?query=… · ?ll=… · ?center=… · ?destination=… (la coma puede venir como %2C)
  new RegExp(`[?&](?:q|query|ll|center|destination|daddr)=(${NUMERO})(?:,|%2C)\\s*(${NUMERO})`, "i"),
  // maps/place/Nombre/@-25.3,-57.6,17z · maps/@-25.3,-57.6,17z
  new RegExp(`@(${NUMERO}),(${NUMERO})`),
  // …/data=!3d-25.3!4d-57.6 (el punto exacto de un lugar)
  new RegExp(`!3d(${NUMERO})!4d(${NUMERO})`),
  // maps/place/-25.3,-57.6
  new RegExp(`/maps/(?:place|search)/(${NUMERO}),\\+?(${NUMERO})`, "i"),
];

function valida(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);
}

/**
 * Las coordenadas que trae un texto: un enlace de Google Maps (varios formatos) o un par de números sueltos ("-25.3, -57.6").
 * Devuelve null si no hay nada que se pueda leer (por ejemplo un enlace corto `maps.app.goo.gl/…`, que solo se abre en el
 * navegador) o si los números no son una ubicación del planeta.
 */
export function extraerUbicacion(texto: string | null | undefined): Ubicacion | null {
  const t = String(texto ?? "").trim();
  if (!t) return null;

  for (const patron of PATRONES) {
    const m = patron.exec(t);
    if (m) {
      const lat = Number(m[1]);
      const lng = Number(m[2]);
      if (valida(lat, lng)) return { lat, lng };
    }
  }

  // Solo dos números separados por coma ("-25.3, -57.6"), como los que copia Google Maps al tocar un punto.
  const suelto = new RegExp(`^(${NUMERO})\\s*,\\s*(${NUMERO})$`).exec(t);
  if (suelto) {
    const lat = Number(suelto[1]);
    const lng = Number(suelto[2]);
    if (valida(lat, lng)) return { lat, lng };
  }
  return null;
}

/** El primer enlace (http o https) que hay en un texto, o null. */
export function primerEnlace(texto: string | null | undefined): string | null {
  const m = /https?:\/\/[^\s<>"']+/i.exec(String(texto ?? ""));
  return m ? m[0] : null;
}

/** El texto sin los enlaces: lo que la persona escribió de la dirección ("casa portón negro"), sin la URL larga. */
export function textoSinEnlaces(texto: string | null | undefined): string {
  return String(texto ?? "")
    .replace(/https?:\/\/[^\s<>"']+/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** El enlace de Google Maps para abrir un punto. */
export function enlaceDeMapa(u: Ubicacion): string {
  return `https://www.google.com/maps?q=${u.lat},${u.lng}`;
}
