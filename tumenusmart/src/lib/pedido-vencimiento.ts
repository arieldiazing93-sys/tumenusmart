/**
 * El tiempo que tiene el cliente de la carta digital para mandar su pedido por WhatsApp.
 *
 * El pedido se crea al tocar "Enviar pedido" y el local solo se entera cuando el cliente toca "Enviar por WhatsApp". Mientras no
 * lo toque, el pedido ocupa stock y aparece en el panel como "sin enviar". Pasado este tiempo se cancela solo (se borra y el
 * stock vuelve) y la pantalla del cliente lo avisa y lo manda a armar el pedido de nuevo. Es lo mismo que ya pasa con las
 * reservas de turnos que no mandan el aviso a tiempo.
 *
 * Pura (sin Prisma ni React): la usan la pantalla del cliente y el servidor.
 */

/** Lo que se le dice al cliente: tiene este tiempo para tocar "Enviar por WhatsApp". */
export const MINUTOS_PARA_ENVIAR_PEDIDO = 5;

/** El servidor espera unos segundos más que el reloj del cliente: lo que tarda la red no le tiene que costar el pedido. */
const SEGUNDOS_DE_GRACIA = 30;

/** Los pedidos creados antes de este instante y todavía sin enviar ya vencieron (con la gracia incluida). */
export function limiteDeEnvio(ahora: Date): Date {
  return new Date(ahora.getTime() - (MINUTOS_PARA_ENVIAR_PEDIDO * 60 + SEGUNDOS_DE_GRACIA) * 1000);
}

/**
 * Los segundos que le quedan al cliente, para mostrar en su cuenta regresiva: unos pocos menos que lo real, así su reloj
 * termina antes que el del servidor y nunca ve "te queda tiempo" con un pedido que ya se borró.
 */
export function segundosParaEnviar(creadoEn: Date, ahora: Date): number {
  const pasados = Math.floor((ahora.getTime() - creadoEn.getTime()) / 1000);
  return Math.max(0, MINUTOS_PARA_ENVIAR_PEDIDO * 60 - pasados - 5);
}

/** "4:59", "0:05". */
export function textoTiempo(segundos: number): string {
  return `${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, "0")}`;
}
