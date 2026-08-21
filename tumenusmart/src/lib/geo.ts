/**
 * Distancia entre dos puntos (fórmula de Haversine), en kilómetros.
 * Se usa para saber a qué zona de envío corresponde el pin que marcó el cliente.
 */
export function distanciaKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371; // radio de la Tierra en km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

type Zona = {
  id: string;
  nombre: string;
  radioKm: number;
  costoEnvio: number;
};

/**
 * Devuelve la primera zona (ordenada de menor a mayor radio) cuyo radio
 * alcanza la distancia dada. Si ninguna alcanza, devuelve null — en ese
 * caso el pedido queda como "a coordinar" en vez de forzar un precio.
 */
export function encontrarZonaPorDistancia(
  zonas: Zona[],
  distancia: number
): Zona | null {
  const ordenadas = [...zonas].sort((a, b) => a.radioKm - b.radioKm);
  return ordenadas.find((z) => distancia <= z.radioKm) ?? null;
}
