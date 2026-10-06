/**
 * Los datos de factura que el cliente escribe en el checkout de la carta digital NO se guardan en el sistema: viajan solo en el
 * mensaje de WhatsApp. Para que lleguen ahí, el formulario los deja un rato en el navegador del propio cliente
 * (`sessionStorage`: solo esa pestaña, se borra al cerrarla) y la pantalla del pedido los agrega al enlace de WhatsApp. Nunca
 * pasan por el servidor ni por la base de datos.
 *
 * Código de navegador: cada acceso al almacenamiento va con try/catch (en una ventana privada o con los datos del sitio
 * bloqueados puede fallar) y, si no hay nada, el mensaje sale igual con "Comprobante: Factura" y la caja los pide por el chat.
 */

import { MARCA_FACTURA_PEDIDA } from "./whatsapp";

export type DatosFacturaCliente = {
  razonSocial: string;
  ruc: string;
  email?: string;
};

const PREFIJO = "factura-cliente:";

export function guardarDatosFacturaCliente(orderId: string, datos: DatosFacturaCliente): void {
  try {
    sessionStorage.setItem(PREFIJO + orderId, JSON.stringify(datos));
  } catch {
    // Sin almacenamiento: el mensaje sale sin los datos y la caja los pide por el chat.
  }
}

export function leerDatosFacturaCliente(orderId: string): DatosFacturaCliente | null {
  try {
    const crudo = sessionStorage.getItem(PREFIJO + orderId);
    if (!crudo) return null;
    const d = JSON.parse(crudo) as Partial<DatosFacturaCliente>;
    if (typeof d.razonSocial !== "string" || typeof d.ruc !== "string") return null;
    return { razonSocial: d.razonSocial, ruc: d.ruc, email: typeof d.email === "string" ? d.email : undefined };
  } catch {
    return null;
  }
}

/**
 * El enlace de WhatsApp con los datos de factura agregados justo debajo de "Comprobante: Factura". Si el mensaje no tiene esa
 * línea (no pidió factura) o el enlace no se puede leer, devuelve el enlace tal cual.
 */
export function enlaceConDatosDeFactura(link: string, datos: DatosFacturaCliente): string {
  try {
    const url = new URL(link);
    const texto = url.searchParams.get("text");
    if (!texto || !texto.includes(MARCA_FACTURA_PEDIDA)) return link;
    const lineas = [MARCA_FACTURA_PEDIDA, `Razón social: ${datos.razonSocial}`, `RUC: ${datos.ruc}`];
    if (datos.email) lineas.push(`Correo: ${datos.email}`);
    const nuevo = texto.replace(MARCA_FACTURA_PEDIDA, lineas.join("\n"));
    return `${url.origin}${url.pathname}?text=${encodeURIComponent(nuevo)}`;
  } catch {
    return link;
  }
}
