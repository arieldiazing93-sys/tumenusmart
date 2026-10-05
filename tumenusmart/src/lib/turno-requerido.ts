/**
 * La regla "no se vende sin turno de caja abierto": cuando alguien va a cobrar (mostrador, pedido, cuenta del comedor, cita) y esa
 * estación no tiene el turno abierto, no se le muestra un error: se lo manda DIRECTO a abrirlo, y al abrirlo vuelve a donde estaba.
 *
 * Pura (sin servidor ni navegador) para que la usen tanto las pantallas como las acciones.
 */

/** La pantalla donde se abre el turno de caja (declarar con cuánto arranca la caja). */
export const RUTA_ABRIR_TURNO = "/admin/pos/abrir";

/** Adónde se va después de abrir el turno si nadie dijo otra cosa: el mostrador. */
export const RUTA_TRAS_ABRIR_TURNO = "/admin/pos";

/**
 * Una ruta de vuelta que se puede usar con tranquilidad: solo páginas del panel (`/admin...`) del mismo sitio. Cualquier otra cosa
 * (otra dirección, `//sitio`, rutas con barra invertida o caracteres raros) se descarta: el enlace de "abrir turno" puede llegar
 * con lo que sea en `volver`, y no puede servir para mandar a la gente a otro lado.
 */
export function rutaDeVueltaSegura(valor: unknown, porDefecto: string = RUTA_TRAS_ABRIR_TURNO): string {
  if (typeof valor !== "string") return porDefecto;
  const ruta = valor.trim();
  if (ruta.length === 0 || ruta.length > 300) return porDefecto;
  if (ruta !== "/admin" && !ruta.startsWith("/admin/") && !ruta.startsWith("/admin?")) return porDefecto;
  // Sin barras invertidas, espacios ni caracteres de control (ni `//`, `..` o `@` en el camino: nada que salga de /admin).
  if (/[\\\s\u0000-\u001f\u007f]/.test(ruta)) return porDefecto;
  const camino = ruta.split("?")[0];
  if (camino.includes("//") || camino.includes("..") || camino.includes("@")) return porDefecto;
  return ruta;
}

/** El enlace para abrir el turno, sabiendo adónde volver cuando se abra (por ejemplo `/admin/comedor`). */
export function rutaParaAbrirTurno(volverA?: string): string {
  if (!volverA) return RUTA_ABRIR_TURNO;
  const ruta = rutaDeVueltaSegura(volverA, "");
  return ruta ? `${RUTA_ABRIR_TURNO}?volver=${encodeURIComponent(ruta)}` : RUTA_ABRIR_TURNO;
}
