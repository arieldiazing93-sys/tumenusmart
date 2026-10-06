/**
 * El pedido ABIERTO — la lógica que no toca la base (se puede probar sin Prisma).
 *
 * Un pedido cargado a mano (Pedidos → Nuevo pedido) nace abierto, igual que la cuenta de una mesa del Servicio comedor: mientras no
 * se cobra, la caja le puede cargar más productos, darle un descuento o cancelar un producto (con motivo) si algo se cargó mal.
 * Recién al final se cobra: ahí se elige la forma de pago y el comprobante (ticket o factura), entra a la caja del turno y se factura.
 * Después del cobro el pedido queda cerrado a cambios (lo único que se puede es cancelarlo, con su flujo de siempre).
 *
 * Acá viven las cuentas del pedido (subtotal, descuento, envío, total) para que la pantalla y el servidor usen exactamente las mismas.
 */

import { calcularDescuento, type DescuentoPedido } from "./descuento-venta";
import { importeDeLinea, totalDeLineas, type ConsumoGuardado } from "./comedor";

/** El descuento guardado en el pedido, como lo entiende `calcularDescuento`; null si no tiene ninguno. */
export function descuentoDePedido(pedido: { descuentoTipo: string | null; descuentoValor: unknown }): DescuentoPedido | null {
  if (pedido.descuentoTipo !== "porcentaje" && pedido.descuentoTipo !== "monto") return null;
  const valor = Number(pedido.descuentoValor);
  if (!Number.isFinite(valor) || valor <= 0) return null;
  return { tipo: pedido.descuentoTipo, valor };
}

export type TotalesDePedido = {
  /** La suma de los productos, sin descuento ni envío. */
  subtotal: number;
  /** Guaraníes que se restan de los productos (0 si no hay descuento). */
  descuento: number;
  /** El porcentaje pedido, si el descuento se cargó así. */
  porcentaje: number | null;
  costoEnvio: number;
  /** Lo que se cobra: productos − descuento + envío. */
  total: number;
  /** Si el descuento ya no corresponde (se cancelaron productos y quedó igual o mayor a los productos): el motivo. */
  descuentoInvalido: string | null;
};

/**
 * Lo que vale un pedido con su descuento. El descuento se calcula sobre los PRODUCTOS (el envío no se descuenta), siempre sobre los
 * que siguen en el pedido: si se cancela uno, un descuento por porcentaje se ajusta solo. Un monto fijo que ya no cabe no se aplica y
 * se avisa en `descuentoInvalido`: no se puede cobrar así hasta que la caja lo cambie o lo quite.
 */
export function totalesDePedido(
  lineas: { precioUnitario: number; cantidad: number }[],
  costoEnvio: number,
  descuento: DescuentoPedido | null
): TotalesDePedido {
  const subtotal = totalDeLineas(lineas);
  const envio = Math.max(0, Math.round(Number(costoEnvio) || 0));
  const calculado = calcularDescuento(subtotal, descuento);
  if (!calculado.ok) {
    return { subtotal, descuento: 0, porcentaje: null, costoEnvio: envio, total: subtotal + envio, descuentoInvalido: calculado.error };
  }
  return {
    subtotal,
    descuento: calculado.monto,
    porcentaje: calculado.porcentaje,
    costoEnvio: envio,
    total: subtotal - calculado.monto + envio,
    descuentoInvalido: null,
  };
}

/**
 * Qué fracción de lo que suman los productos se cobró de verdad (para los reportes que suman por producto). Los ítems de un pedido
 * guardan su precio SIN el descuento; el envío no lleva descuento, por eso acá se usa el subtotal (no el total). Sin descuento, 1.
 */
export function factorDeDescuentoPedido(subtotal: number, descuento: number): number {
  return descuento > 0 && subtotal > descuento ? (subtotal - descuento) / subtotal : 1;
}

/** El pedido se puede seguir cambiando mientras no se cobró ni se canceló. */
export function pedidoAbierto(pedido: { estado: string; turnoPosId: string | null }): boolean {
  return !pedido.turnoPosId && pedido.estado !== "cancelado" && pedido.estado !== "entregado";
}

/** Por qué un pedido ya no se puede modificar (null si todavía se puede). */
export function motivoPedidoCerrado(pedido: { estado: string; turnoPosId: string | null }): string | null {
  if (pedido.estado === "cancelado") return "Ese pedido está cancelado.";
  if (pedido.turnoPosId) return "Ese pedido ya está cobrado: no se puede modificar. Si hay que corregir algo, cancelalo y cargalo de nuevo.";
  if (pedido.estado === "entregado") return "Ese pedido ya se entregó.";
  return null;
}

/**
 * Lo que descontó una línea de cada insumo, listo para guardarlo en el ítem (ya multiplicado por la cantidad): así, si el producto
 * se cancela, se devuelve al stock exactamente eso. `consumo` es el consumo POR UNIDAD que trae el armado del pedido.
 */
export function consumoParaGuardar(linea: {
  cantidad: number;
  consumo: { insumoId: string; almacenId: string | null; cantidad: number }[];
}): ConsumoGuardado[] {
  // Igual que al descontar el stock (src/lib/movimientos-stock.ts): un mismo insumo y almacén se suma y recién ahí se redondea a
  // 3 decimales, así lo que se devuelve es justo lo que bajó.
  const mapa = new Map<string, ConsumoGuardado>();
  for (const c of linea.consumo) {
    const clave = `${c.insumoId}|${c.almacenId ?? ""}`;
    const actual = mapa.get(clave);
    const cantidad = c.cantidad * linea.cantidad;
    if (actual) actual.cantidad += cantidad;
    else mapa.set(clave, { insumoId: c.insumoId, almacenId: c.almacenId, cantidad });
  }
  return [...mapa.values()]
    .map((c) => ({ ...c, cantidad: Math.round(c.cantidad * 1000) / 1000 }))
    .filter((c) => c.cantidad !== 0);
}

/** Lo que vale una línea del pedido (el importe entero), por si la pantalla lo necesita sin traer comedor.ts. */
export { importeDeLinea };
