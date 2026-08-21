import { formatearGuarani } from "./format";

type ItemPedido = {
  nombreProducto: string;
  cantidad: number;
  precioUnitario: number;
  opcionesTexto?: string | null;
  ingredientesQuitadosTexto?: string | null;
};

type DatosMensaje = {
  pedidoId: string;
  saludo?: string | null;
  clienteNombre: string;
  tipoEntrega: string;
  direccion?: string | null;
  zonaNombre?: string | null;
  clienteLat?: number | null;
  clienteLng?: number | null;
  metodoPagoReferencia: string;
  comprobanteTipo?: string | null;
  facturaRazonSocial?: string | null;
  facturaRuc?: string | null;
  facturaEmail?: string | null;
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
    if (item.ingredientesQuitadosTexto) lineas.push(`   ${item.ingredientesQuitadosTexto}`);
  }

  lineas.push("");
  lineas.push(`Subtotal: ${formatearGuarani(datos.subtotal)}`);
  if (datos.tipoEntrega === "delivery") {
    const envioTexto = datos.zonaNombre
      ? `${formatearGuarani(datos.costoEnvio)} (${datos.zonaNombre})`
      : "A coordinar";
    lineas.push(`Envío: ${envioTexto}`);
  }
  lineas.push(`Total: ${formatearGuarani(datos.total)}${datos.tipoEntrega === "delivery" && !datos.zonaNombre ? " + envío" : ""}`);
  lineas.push("");
  lineas.push(
    datos.tipoEntrega === "delivery"
      ? `Entrega a domicilio: ${datos.direccion ?? "-"}`
      : "Retiro en el local"
  );
  if (datos.tipoEntrega === "delivery" && datos.clienteLat != null && datos.clienteLng != null) {
    lineas.push(
      `Ubicación: https://www.google.com/maps?q=${datos.clienteLat},${datos.clienteLng}`
    );
  }
  lineas.push(`Método de pago: ${ETIQUETAS_PAGO[datos.metodoPagoReferencia] ?? datos.metodoPagoReferencia}`);

  if (datos.comprobanteTipo === "factura") {
    lineas.push("");
    lineas.push("Comprobante: Factura");
    if (datos.facturaRazonSocial) lineas.push(`Razón social: ${datos.facturaRazonSocial}`);
    if (datos.facturaRuc) lineas.push(`RUC: ${datos.facturaRuc}`);
    if (datos.facturaEmail) lineas.push(`Correo: ${datos.facturaEmail}`);
  }

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
