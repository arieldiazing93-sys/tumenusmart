/**
 * La ubicación de un negocio a partir de un enlace de Google Maps: sacar las coordenadas del enlace y armar los enlaces para
 * abrirlo, llegar y compartirlo.
 *
 * Puro (sin red ni Prisma): lo usan la acción que guarda la página (que además resuelve los enlaces cortos de «Compartir» de Maps), la
 * página pública y las pruebas. Todo lo que viene de afuera se revisa: solo se aceptan enlaces https de los dominios de Google Maps.
 */

export type Coordenadas = { lat: number; lng: number };

/** Los dominios que se aceptan como enlace de Google Maps (el enlace corto que da «Compartir» y los largos). */
const DOMINIOS_DE_MAPAS = ["maps.app.goo.gl", "goo.gl", "google.com", "maps.google.com", "g.page", "share.google"];

function esDominioPermitido(host: string): boolean {
  const h = host.toLowerCase();
  return DOMINIOS_DE_MAPAS.some((d) => h === d || h.endsWith(`.${d}`));
}

/** El enlace como URL, solo si es https de un dominio de Google Maps. null si no sirve. */
export function urlDeGoogleMaps(texto: string): URL | null {
  const t = (texto ?? "").trim();
  if (!t || t.length > 600) return null;
  let url: URL;
  try {
    url = new URL(t);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (!esDominioPermitido(url.hostname)) return null;
  // google.com solo vale si es de mapas (no cualquier otra página de Google).
  const host = url.hostname.toLowerCase();
  if ((host === "google.com" || host.endsWith(".google.com")) && host !== "maps.google.com") {
    if (!url.pathname.toLowerCase().startsWith("/maps")) return null;
  }
  return url;
}

/** ¿Es un enlace que se puede mostrar como ubicación? */
export function esEnlaceDeGoogleMaps(texto: string): boolean {
  return urlDeGoogleMaps(texto) !== null;
}

function enRango(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

/**
 * Las coordenadas que lleva un enlace LARGO de Google Maps, si las tiene. Prefiere el punto exacto del lugar (`!3d…!4d…`) al centro de
 * la vista (`@lat,lng`), y mira también `q=`, `ll=`, `query=` y `center=` con «lat,lng». Un enlace corto (maps.app.goo.gl) no las trae:
 * hay que seguir su redirección primero (ver ubicacion-maps-servidor.ts).
 */
export function leerCoordenadasDeMaps(texto: string): Coordenadas | null {
  const t = (texto ?? "").trim();
  if (!t) return null;
  let decodificado = t;
  try {
    decodificado = decodeURIComponent(t);
  } catch {
    // Un enlace con un «%» suelto: se lee tal cual.
  }

  const numero = "(-?\\d{1,3}(?:\\.\\d+)?)";
  const patrones: RegExp[] = [
    // El pin del lugar: ...!3d-25.2866!4d-57.647...
    new RegExp(`!3d${numero}!4d${numero}`),
    // El centro de la vista: /@-25.2866,-57.647,17z
    new RegExp(`@${numero},${numero}`),
    // Parámetros: ?q=-25.28,-57.64  ?ll=...  ?query=...  ?center=...  ?q=loc:-25.28,-57.64
    new RegExp(`[?&](?:q|ll|query|center|destination)=(?:loc:)?\\+?${numero}\\s*,\\s*${numero}`),
  ];
  for (const patron of patrones) {
    const m = decodificado.match(patron);
    if (!m) continue;
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    if (enRango(lat, lng)) return { lat, lng };
  }
  return null;
}

/** El enlace para que Google Maps trace la ruta hasta ese punto (abre la app en el celular). */
export function enlaceComoLlegar(c: Coordenadas): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}`;
}

/** El enlace de WhatsApp para mandar la ubicación a otra persona: «Nombre — enlace». */
export function enlaceParaCompartirPorWhatsapp(nombre: string, enlace: string): string {
  const texto = [nombre.trim(), enlace.trim()].filter(Boolean).join("\n");
  return `https://wa.me/?text=${encodeURIComponent(texto)}`;
}
