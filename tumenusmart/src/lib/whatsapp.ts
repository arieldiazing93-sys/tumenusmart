import { formatearGuarani } from "./format";

type ItemPedido = {
  nombreProducto: string;
  cantidad: number;
  precioUnitario: number;
  opcionesTexto?: string | null;
};

type DatosMensaje = {
  pedidoId: string;
  saludo?: string | null;
  clienteNombre: string;
  tipoEntrega: string;
  direccion?: string | null;
  zonaNombre?: string | null;
  metodoPagoReferencia: string;
  notas?: string | null;
  items: ItemPedido[];
  subtotal: number;
  costoEnvio: number;
  total: number;
};

const ETIQUETAS_PAGO: Record<string, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  tarjeta: "Tarjeta (POS al recibir)",
  otro: "A coordinar",
};

/**
 * Arma el texto del pedido, prolijo y legible, tal como lo va a
 * recibir el restaurante en WhatsApp.
 */
export function construirMensajePedido(datos: DatosMensaje): string {
  const lineas: string[] = [];

  if (datos.saludo) lineas.push(datos.saludo);
  lineas.push(`Pedido #${datos.pedidoId.slice(-6).toUpperCase()}`);
  lineas.push("");
  lineas.push(`Cliente: ${datos.clienteNombre}`);
  lineas.push("");
  lineas.push("Detalle:");

  for (const item of datos.items) {
    let linea = `• ${item.cantidad}x ${item.nombreProducto}`;
    if (item.opcionesTexto) linea += ` (${item.opcionesTexto})`;
    linea += ` — ${formatearGuarani(item.cantidad * item.precioUnitario)}`;
    lineas.push(linea);
  }

  lineas.push("");
  lineas.push(`Subtotal: ${formatearGuarani(datos.subtotal)}`);
  if (datos.tipoEntrega === "delivery") {
    lineas.push(`Envío (${datos.zonaNombre ?? "-"}): ${formatearGuarani(datos.costoEnvio)}`);
  }
  lineas.push(`Total: ${formatearGuarani(datos.total)}`);
  lineas.push("");
  lineas.push(
    datos.tipoEntrega === "delivery"
      ? `Entrega a domicilio: ${datos.direccion ?? "-"}`
      : "Retiro en el local"
  );
  lineas.push(`Método de pago: ${ETIQUETAS_PAGO[datos.metodoPagoReferencia] ?? datos.metodoPagoReferencia}`);

  if (datos.notas) {
    lineas.push("");
    lineas.push(`Nota: ${datos.notas}`);
  }

  return lineas.join("\n");
}

/**
 * Genera el link wa.me con el mensaje ya codificado.
 * numeroWhatsapp debe estar en formato internacional sin '+', ej: 595981234567
 */
export function construirLinkWhatsapp(numeroWhatsapp: string, mensaje: string): string {
  const numeroLimpio = numeroWhatsapp.replace(/[^\d]/g, "");
  return `https://wa.me/${numeroLimpio}?text=${encodeURIComponent(mensaje)}`;
}
