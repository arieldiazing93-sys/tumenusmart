/**
 * Servicio delivery — la lógica que no toca la base (se puede probar sin Prisma).
 *
 * Una cuenta de delivery es como la de una mesa del comedor (productos cargados en varias tandas, descuento, cuenta impresa, cobro),
 * pero con el cliente y su dirección, el costo de envío y un repartidor. Acá viven las cuentas de la cuenta (con el envío que no se
 * descuenta) y la línea que el envío ocupa en la venta y la factura.
 */

import { calcularDescuento, type DescuentoPedido } from "./descuento-venta";
import { totalDeLineas, type LineaDeCobro } from "./comedor";

/** Las cuentas de delivery que se siguen operando: la cuenta todavía no se pagó ni se canceló. */
export const ESTADOS_DELIVERY_ABIERTA = ["abierta", "por_cobrar"] as const;

/** El nombre de la línea de envío en la venta, la factura y los papeles. */
export const NOMBRE_LINEA_ENVIO = "Costo de envío";

/** Largos máximos de lo que se escribe al abrir una cuenta. */
export const LARGO_DELIVERY = { nombre: 80, telefono: 30, direccion: 200, notas: 500, razonSocial: 120, documento: 30, email: 120 };

/** Tope del envío: más que esto es un número mal tipeado, no un precio. */
export const ENVIO_MAXIMO = 10_000_000;

/** "Delivery 12" — cómo se llama la cuenta en comandas, ticket y listas. */
export function nombreDeCuentaDelivery(numero: number): string {
  return `Delivery ${numero}`;
}

export type TotalesDeDelivery = {
  /** La suma de los productos que siguen en la cuenta, sin descuento ni envío. */
  subtotal: number;
  /** Guaraníes que se restan de los productos (0 si no hay descuento). */
  descuento: number;
  /** El porcentaje pedido, si el descuento se cargó así. */
  porcentaje: number | null;
  /** El costo de envío (no se descuenta). */
  envio: number;
  /** Lo que se cobra: productos − descuento + envío. */
  total: number;
  /** Si el descuento ya no corresponde (se cancelaron productos y quedó igual o mayor a la cuenta): el motivo. */
  descuentoInvalido: string | null;
};

/**
 * Lo que vale una cuenta de delivery. El descuento se calcula sobre los PRODUCTOS (el envío no se descuenta) y siempre sobre los que
 * siguen en la cuenta: si se cancela uno, un descuento por porcentaje se ajusta solo. Un monto fijo que ya no cabe no se aplica y se
 * avisa en `descuentoInvalido`: no se puede imprimir ni cobrar así hasta que la caja lo corrija.
 */
export function totalesDeDelivery(
  lineas: { precioUnitario: number; cantidad: number }[],
  costoEnvio: number,
  descuento: DescuentoPedido | null
): TotalesDeDelivery {
  const subtotal = totalDeLineas(lineas);
  const envio = Math.max(0, Math.round(Number(costoEnvio) || 0));
  const calculado = calcularDescuento(subtotal, descuento);
  if (!calculado.ok) {
    return { subtotal, descuento: 0, porcentaje: null, envio, total: subtotal + envio, descuentoInvalido: calculado.error };
  }
  return {
    subtotal,
    descuento: calculado.monto,
    porcentaje: calculado.porcentaje,
    envio,
    total: subtotal - calculado.monto + envio,
    descuentoInvalido: null,
  };
}

/**
 * La línea de "Costo de envío" tal como entra a la venta y a la factura: gravado al 10 % igual que un servicio, sin producto ni costo.
 * Se junta con las líneas de los productos para el desglose del IVA y el reparto del descuento (así las líneas suman exacto lo que
 * se cobra). Devuelve null si no hay envío.
 */
export function lineaDeEnvio(costoEnvio: number): LineaDeCobro | null {
  const envio = Math.round(Number(costoEnvio) || 0);
  if (envio <= 0) return null;
  return {
    productId: null,
    nombreProducto: NOMBRE_LINEA_ENVIO,
    cantidad: 1,
    precioUnitario: envio,
    iva: "gravado10",
    opcionesTexto: null,
    // Costo conocido y en cero: la línea no cuenta como "sin costo" en los reportes de rentabilidad.
    costoProducto: 0,
    costoAgregados: 0,
    precioAgregados: 0,
  };
}

/** El costo de envío escrito en pantalla ("" = 0): el número, o null si no es un monto válido. */
export function leerCostoEnvio(texto: unknown): number | null {
  const crudo = String(texto ?? "").trim();
  if (crudo === "") return 0;
  const n = Number(crudo.replace(",", "."));
  if (!Number.isFinite(n) || n < 0 || n > ENVIO_MAXIMO) return null;
  return Math.round(n);
}
