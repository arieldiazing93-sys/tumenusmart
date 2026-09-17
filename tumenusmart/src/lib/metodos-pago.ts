/**
 * Las formas de pago que ofrece el checkout público, en un solo lugar.
 *
 * Antes cada pantalla que mostraba "Pago: X" (el ticket, el mensaje de
 * WhatsApp, la pantalla del repartidor) tenía su propia copia idéntica de
 * este mapa de etiquetas — al separar Tarjeta en débito/crédito había que
 * encontrar las tres copias y no desincronizarlas. Ahora hay una sola.
 */

export type MetodoPagoPedido = "efectivo" | "transferencia" | "tarjeta_debito" | "tarjeta_credito";

export const METODOS_PAGO_PEDIDO: { value: MetodoPagoPedido; label: string; sublabel?: string }[] = [
  { value: "efectivo", label: "Efectivo" },
  { value: "transferencia", label: "Transferencia" },
  { value: "tarjeta_debito", label: "Tarjeta débito", sublabel: "POS al recibir" },
  { value: "tarjeta_credito", label: "Tarjeta crédito", sublabel: "POS al recibir" },
];

const ETIQUETAS: Record<string, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  tarjeta_debito: "Tarjeta débito",
  tarjeta_credito: "Tarjeta crédito",
  // Valor viejo: pedidos de antes de separar débito y crédito en dos
  // opciones. Se deja un texto genérico a propósito — no hay forma de saber
  // cuál de las dos era en su momento, y no se toca el dato histórico.
  tarjeta: "Tarjeta (POS al recibir)",
  // El checkout público nunca ofrece "otro" — es un valor solo informativo
  // para pedidos cargados por otra vía.
  otro: "A coordinar",
};

export function etiquetaMetodoPago(valor: string): string {
  return ETIQUETAS[valor] ?? valor;
}
