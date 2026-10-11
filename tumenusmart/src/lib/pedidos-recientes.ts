/**
 * Los pedidos que el cliente hizo desde ESTE navegador, para que no pierda el rastro.
 *
 * El enlace de seguimiento (`/<local>/pedido/<llave>`) es privado y largo: si el cliente retrocede o cierra la pestaña, sin esto no
 * tiene cómo volver a su pedido. Al enviarlo se guarda acá (en el navegador, nada en el servidor) y el menú, el carrito y el pago
 * ofrecen «Ver mi pedido» mientras el pedido sea reciente.
 *
 * Todo es "lo mejor posible": si el navegador no deja guardar (modo privado, almacenamiento lleno), simplemente no hay recientes y
 * el cliente igual tiene el enlace en la pantalla y en su WhatsApp.
 */

export type PedidoReciente = { token: string; numero: number; en: number };

/** Cuánto tiempo se ofrece volver a un pedido. */
export const VIGENCIA_PEDIDO_RECIENTE_MS = 48 * 60 * 60 * 1000;
const MAXIMO_RECIENTES = 5;
const FORMATO_TOKEN = /^[A-Za-z0-9_-]{20,64}$/;

const claveDe = (slug: string) => `tumenusmart:pedidos:${slug}`;

/** Lo que haya guardado, sin lo vencido ni lo que no tenga la forma de un pedido (el almacenamiento lo puede tocar cualquiera). */
export function depurarRecientes(crudo: unknown, ahora: number): PedidoReciente[] {
  if (!Array.isArray(crudo)) return [];
  const lista: PedidoReciente[] = [];
  for (const x of crudo) {
    if (!x || typeof x !== "object") continue;
    const { token, numero, en } = x as Record<string, unknown>;
    if (typeof token !== "string" || !FORMATO_TOKEN.test(token)) continue;
    if (typeof numero !== "number" || !Number.isInteger(numero) || numero <= 0) continue;
    if (typeof en !== "number" || !Number.isFinite(en) || ahora - en > VIGENCIA_PEDIDO_RECIENTE_MS || en > ahora + 60_000) continue;
    lista.push({ token, numero, en });
  }
  return lista;
}

/** La lista con un pedido nuevo agregado: el más reciente primero, sin repetir y con un máximo. */
export function sumarReciente(lista: PedidoReciente[], nuevo: { token: string; numero: number }, ahora: number): PedidoReciente[] {
  const sinRepetir = lista.filter((p) => p.token !== nuevo.token);
  return [{ token: nuevo.token, numero: nuevo.numero, en: ahora }, ...sinRepetir].slice(0, MAXIMO_RECIENTES);
}

export function leerPedidosRecientes(slug: string, ahora: number = Date.now()): PedidoReciente[] {
  try {
    const texto = window.localStorage.getItem(claveDe(slug));
    if (!texto) return [];
    return depurarRecientes(JSON.parse(texto), ahora).sort((a, b) => b.en - a.en);
  } catch {
    return [];
  }
}

export function guardarPedidoReciente(slug: string, pedido: { token: string; numero: number }, ahora: number = Date.now()): void {
  try {
    const actuales = leerPedidosRecientes(slug, ahora);
    window.localStorage.setItem(claveDe(slug), JSON.stringify(sumarReciente(actuales, pedido, ahora)));
  } catch {
    // Sin almacenamiento no hay recientes: el enlace sigue en la pantalla y en el WhatsApp.
  }
}
