import { claveDiaAsuncion } from "./timezone";

/**
 * Lo puro de las cuentas por pagar (sin base de datos), para poder usarlo
 * también desde los componentes del navegador: cómo se paga, cuánto falta
 * pagar de una compra y cuándo vence. El saldo nunca se guarda: es el total
 * de la compra menos la suma de sus pagos (PagoCompra).
 */

/** Cómo se le paga al proveedor. Las cuatro fijas: el pago guarda el `valor`. */
export const FORMAS_PAGO_PROVEEDOR = [
  { valor: "efectivo", etiqueta: "Efectivo" },
  { valor: "transferencia", etiqueta: "Transferencia" },
  { valor: "cheque", etiqueta: "Cheque" },
  { valor: "otro", etiqueta: "Otro" },
] as const;

export function etiquetaFormaPago(valor: string): string {
  return FORMAS_PAGO_PROVEEDOR.find((f) => f.valor === valor)?.etiqueta ?? valor;
}

export type EstadoCuenta = "pendiente" | "parcial" | "pagada";

export const ETIQUETA_ESTADO_CUENTA: Record<EstadoCuenta, string> = {
  pendiente: "Pendiente",
  parcial: "Pago parcial",
  pagada: "Pagada",
};

export function redondear2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Lo que falta pagar de una compra (nunca negativo). */
export function saldoDeCompra(total: number, pagado: number): number {
  return Math.max(0, redondear2(total - pagado));
}

export function estadoDeCuenta(total: number, pagado: number): EstadoCuenta {
  if (saldoDeCompra(total, pagado) <= 0) return "pagada";
  return pagado > 0 ? "parcial" : "pendiente";
}

/** El vencimiento en palabras: "Vencida hace 3 días", "Vence hoy", "Vence en 5 días". */
export function textoVencimiento(dias: number | null): string {
  if (dias == null) return "Sin vencimiento";
  if (dias < 0) return `Vencida hace ${-dias} ${dias === -1 ? "día" : "días"}`;
  if (dias === 0) return "Vence hoy";
  return `Vence en ${dias} ${dias === 1 ? "día" : "días"}`;
}

/**
 * Cuántos días faltan para el vencimiento, contando desde hoy en Asunción:
 * 0 = vence hoy, negativo = ya venció. Null si la compra no tiene vencimiento.
 * (El vencimiento se guarda como la medianoche UTC del día elegido.)
 */
export function diasParaVencer(vencimiento: Date | null, ahora: Date = new Date()): number | null {
  if (!vencimiento) return null;
  const hoy = Date.parse(claveDiaAsuncion(ahora));
  const vence = Date.parse(vencimiento.toISOString().slice(0, 10));
  return Math.round((vence - hoy) / (24 * 60 * 60 * 1000));
}
