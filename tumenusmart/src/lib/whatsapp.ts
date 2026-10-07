import { formatearGuarani, formatearNumero } from "./format";
import { etiquetaMetodoPago } from "./metodos-pago";

type ItemPedido = {
  nombreProducto: string;
  cantidad: number;
  precioUnitario: number;
  opcionesTexto?: string | null;
  ingredientesQuitadosTexto?: string | null;
};

type DatosMensaje = {
  /** El número de pedido, si ya existe. El menú digital no crea pedidos (solo arma este mensaje), así que normalmente no hay. */
  numero?: number | null;
  saludo?: string | null;
  clienteNombre: string;
  /** El teléfono que escribió el cliente: la caja lo necesita para cargar el pedido a mano. */
  clienteTelefono?: string | null;
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

/**
 * Un dato del mensaje: el concepto va en negrita (así se distingue de lo que pidió el cliente) y después el valor. En WhatsApp la
 * negrita es el texto entre asteriscos: `*Cliente:* Ariel`.
 */
function campo(concepto: string, valor: string): string {
  return `*${concepto}:* ${valor}`;
}

/**
 * Arma el texto del pedido, prolijo y legible, tal como lo va a recibir el
 * restaurante en WhatsApp. Es lo ÚNICO que sale del menú digital: la caja lo lee
 * y carga el pedido a mano en el sistema (los datos de factura incluidos: los
 * compara antes en la DNIT). Cada concepto con dos puntos (Cliente:, Teléfono:, Total:…) sale en negrita.
 */
export function construirMensajePedido(datos: DatosMensaje): string {
  const lineas: string[] = [];

  if (datos.saludo) lineas.push(datos.saludo);
  lineas.push(datos.numero != null ? `Pedido ${formatearNumero(datos.numero)}` : "Pedido nuevo");
  lineas.push("");
  lineas.push(campo("Cliente", datos.clienteNombre));
  if (datos.clienteTelefono?.trim()) lineas.push(campo("Teléfono", datos.clienteTelefono.trim()));

  if (datos.comprobanteTipo === "factura") {
    lineas.push(campo("Comprobante", "Factura"));
    if (datos.facturaRazonSocial) lineas.push(campo("Razón social", datos.facturaRazonSocial));
    if (datos.facturaRuc) lineas.push(campo("RUC", datos.facturaRuc));
    if (datos.facturaEmail) lineas.push(campo("Correo", datos.facturaEmail));
  }
  lineas.push(campo("Método de pago", etiquetaMetodoPago(datos.metodoPagoReferencia)));

  lineas.push("");
  lineas.push("*Detalle:*");

  for (const item of datos.items) {
    let linea = `• ${item.cantidad}x ${item.nombreProducto}`;
    if (item.opcionesTexto) linea += ` (${item.opcionesTexto})`;
    linea += ` — ${formatearGuarani(item.cantidad * item.precioUnitario)}`;
    lineas.push(linea);
    if (item.ingredientesQuitadosTexto) lineas.push(`   ${item.ingredientesQuitadosTexto}`);
  }

  lineas.push("");
  lineas.push(campo("Subtotal", formatearGuarani(datos.subtotal)));
  if (datos.tipoEntrega === "delivery") {
    const envioTexto = datos.zonaNombre
      ? `${formatearGuarani(datos.costoEnvio)} (${datos.zonaNombre})`
      : "A coordinar";
    lineas.push(campo("Envío", envioTexto));
  }
  lineas.push(campo("Total", `${formatearGuarani(datos.total)}${datos.tipoEntrega === "delivery" && !datos.zonaNombre ? " + envío" : ""}`));
  lineas.push("");
  lineas.push(
    datos.tipoEntrega === "delivery"
      ? datos.direccion?.trim()
        ? campo("Entrega a domicilio", datos.direccion.trim())
        : // Sin referencia escrita, el pin del mapa es la dirección. Poner un
          // guion suelto haría pensar que se perdió el dato.
          "*Entrega a domicilio* — ver ubicación abajo"
      : "Retiro en el local"
  );
  if (datos.tipoEntrega === "delivery" && datos.clienteLat != null && datos.clienteLng != null) {
    lineas.push(campo("Ubicación", `https://www.google.com/maps?q=${datos.clienteLat},${datos.clienteLng}`));
  }

  if (datos.notas) {
    lineas.push("");
    lineas.push(campo("Nota", datos.notas));
  }

  if (datos.linkSeguimiento) {
    lineas.push("");
    lineas.push(campo("Seguí tu pedido acá", datos.linkSeguimiento));
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

/**
 * Lleva un teléfono cargado por el cliente al formato internacional que
 * necesita wa.me. Los clientes escriben "0984 792335", "0984792335" o
 * "+595984792335" indistintamente, y todos tienen que terminar igual.
 *
 * Prefijo de Paraguay (595) por defecto, que es donde opera el sistema.
 */
export function normalizarTelefonoParaWhatsapp(telefono: string, paisPorDefecto = "595"): string {
  const soloDigitos = telefono.replace(/[^\d]/g, "");
  if (!soloDigitos) return "";

  // Ya viene con código de país.
  if (soloDigitos.startsWith(paisPorDefecto)) return soloDigitos;

  // Formato local con 0 adelante: se reemplaza por el código de país.
  if (soloDigitos.startsWith("0")) return paisPorDefecto + soloDigitos.slice(1);

  return paisPorDefecto + soloDigitos;
}

/** Link para que el LOCAL le escriba al cliente (al revés del flujo normal). */
export function linkWhatsappCliente(telefonoCliente: string, mensaje: string): string {
  const numero = normalizarTelefonoParaWhatsapp(telefonoCliente);
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
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
  lineas.push(campo("Cliente", datos.clienteNombre));
  lineas.push(campo("Teléfono", datos.clienteTelefono));
  if (datos.clienteEmail) lineas.push(campo("Correo", datos.clienteEmail));
  lineas.push("");
  lineas.push(campo("Fecha", datos.fechaTexto));
  lineas.push(campo("Turno", `${datos.turnoTexto} — ${datos.horario}`));
  lineas.push(campo("Personas", String(datos.personas)));
  lineas.push(campo("Motivo", datos.motivoTexto));

  return lineas.join("\n");
}
