import { leerCoordenadasDeMaps, urlDeGoogleMaps, type Coordenadas } from "./ubicacion-maps";

/**
 * Las coordenadas de un enlace de Google Maps, incluidos los enlaces CORTOS que da el botón «Compartir» de Maps (maps.app.goo.gl/…):
 * esos no traen las coordenadas, así que se sigue su redirección hasta llegar al enlace largo.
 *
 * Solo corre en el servidor y solo al GUARDAR la página (no en cada visita). Es una consulta hacia afuera hecha con un dato que escribe
 * una persona, así que va con las precauciones de siempre: solo https y solo dominios de Google Maps (en cada salto), a mano y con un
 * tope de saltos y de tiempo; nunca se sigue una redirección a otro lado. Si algo falla devuelve null: la página igual se guarda y
 * muestra el botón de abrir el enlace, solo sin mapa.
 */
const MAXIMO_DE_SALTOS = 5;
const TIEMPO_MAXIMO_MS = 5000;

export async function resolverCoordenadasDeMaps(enlace: string): Promise<Coordenadas | null> {
  let actual = urlDeGoogleMaps(enlace);
  if (!actual) return null;

  const directas = leerCoordenadasDeMaps(actual.toString());
  if (directas) return directas;

  for (let salto = 0; salto < MAXIMO_DE_SALTOS; salto++) {
    let respuesta: Response;
    try {
      respuesta = await fetch(actual.toString(), {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(TIEMPO_MAXIMO_MS),
        headers: { "User-Agent": "Mozilla/5.0 (compatible; TuMenuSmart/1.0)" },
      });
    } catch {
      return null;
    }

    const destino = respuesta.headers.get("location");
    if (respuesta.status >= 300 && respuesta.status < 400 && destino) {
      let siguiente: URL;
      try {
        siguiente = new URL(destino, actual);
      } catch {
        return null;
      }
      // Cada salto tiene que seguir siendo Google Maps: nunca se sale a otro dominio.
      const permitido = urlDeGoogleMaps(siguiente.toString());
      if (!permitido) return null;
      const coordenadas = leerCoordenadasDeMaps(permitido.toString());
      if (coordenadas) return coordenadas;
      actual = permitido;
      continue;
    }

    // Sin más redirecciones: a veces el enlace largo lleva las coordenadas en la propia página.
    try {
      const texto = await respuesta.text();
      const m = texto.match(/!3d(-?\d{1,3}\.\d+)!4d(-?\d{1,3}\.\d+)/) ?? texto.match(/@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/);
      if (m) {
        const lat = Number(m[1]);
        const lng = Number(m[2]);
        if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng };
      }
    } catch {
      // Sin cuerpo que leer.
    }
    return null;
  }
  return null;
}
