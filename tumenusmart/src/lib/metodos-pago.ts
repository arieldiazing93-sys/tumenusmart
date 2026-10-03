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

/**
 * Las formas de pago que el local tiene tildadas en Configuración. Si por algún motivo no hay ninguna, se ofrecen
 * todas: no tiene sentido dejar sin poder cargar un pedido. Sirve para mostrar las opciones y para volver a
 * comprobarlas en el servidor.
 */
export function metodosPagoHabilitados(
  local: {
    aceptaEfectivo?: boolean;
    aceptaTransferencia?: boolean;
    aceptaTarjetaDebito?: boolean;
    aceptaTarjetaCredito?: boolean;
  } | null | undefined
): typeof METODOS_PAGO_PEDIDO {
  const habilitados: Record<MetodoPagoPedido, boolean> = {
    efectivo: local?.aceptaEfectivo ?? true,
    transferencia: local?.aceptaTransferencia ?? true,
    tarjeta_debito: local?.aceptaTarjetaDebito ?? true,
    tarjeta_credito: local?.aceptaTarjetaCredito ?? true,
  };
  const ofrecidos = METODOS_PAGO_PEDIDO.filter((m) => habilitados[m.value]);
  return ofrecidos.length > 0 ? ofrecidos : METODOS_PAGO_PEDIDO;
}

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
