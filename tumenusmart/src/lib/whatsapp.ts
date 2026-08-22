import { formatearGuarani, formatearNumero } from "./format";

type ItemPedido = {
  nombreProducto: string;
  cantidad: number;
  precioUnitario: number;
  opcionesTexto?: string | null;
  ingredientesQuitadosTexto?: string | null;
};

type DatosMensaje = {
  numero: number;
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
  /** link público donde el cliente sigue el estado del pedido en vivo */
  linkSeguimiento?: string | null;
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
  lineas.push(`Pedido ${formatearNumero(datos.numero)}`);
  lineas.push("");
  lineas.push(`Cliente: ${datos.clienteNombre}`);

  if (datos.comprobanteTipo === "factura") {
    lineas.push("Comprobante: Factura");
    if (datos.facturaRazonSocial) lineas.push(`Razón social: ${datos.facturaRazonSocial}`);
    if (datos.facturaRuc) lineas.push(`RUC: ${datos.facturaRuc}`);
    if (datos.facturaEmail) lineas.push(`Correo: ${datos.facturaEmail}`);
  }
  lineas.push(`Método de pago: ${ETIQUETAS_PAGO[datos.metodoPagoReferencia] ?? datos.metodoPagoReferencia}`);

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

  if (datos.notas) {
    lineas.push("");
    lineas.push(`Nota: ${datos.notas}`);
  }

  if (datos.linkSeguimiento) {
    lineas.push("");
    lineas.push(`Seguí tu pedido acá: ${datos.linkSeguimiento}`);
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

type DatosMensajeReserva = {
  numero: number;
  saludo?: string | null;
  clienteNombre: string;
  clienteTelefono: string;
  clienteEmail?: string | null;
  fechaTexto: string; // ya formateada, ej: "22/08/2026"
  turnoTexto: string; // etiqueta ya traducida, ej: "Tarde"
  horario: string;
  personas: number;
  motivoTexto: string; // etiqueta ya traducida, ej: "Cumpleaños"
};

/**
 * Arma el texto de la reserva, prolijo y legible, tal como lo va a
 * recibir el restaurante en WhatsApp.
 */
export function construirMensajeReserva(datos: DatosMensajeReserva): string {
  const lineas: string[] = [];

  if (datos.saludo) lineas.push(datos.saludo);
  lineas.push(`Reserva ${formatearNumero(datos.numero)}`);
  lineas.push("");
  lineas.push(`Cliente: ${datos.clienteNombre}`);
  lineas.push(`Teléfono: ${datos.clienteTelefono}`);
  if (datos.clienteEmail) lineas.push(`Correo: ${datos.clienteEmail}`);
  lineas.push("");
  lineas.push(`Fecha: ${datos.fechaTexto}`);
  lineas.push(`Turno: ${datos.turnoTexto} — ${datos.horario}`);
  lineas.push(`Personas: ${datos.personas}`);
  lineas.push(`Motivo: ${datos.motivoTexto}`);

  return lineas.join("\n");
}
