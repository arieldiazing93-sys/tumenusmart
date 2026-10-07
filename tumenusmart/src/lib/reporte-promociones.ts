import { etiquetaDePromo, type PromoDef } from "./promociones";

/**
 * Reporte de Promociones: cuánto se descontó y cuánto se regaló con cada promoción (ver promociones.ts), en el mostrador, el comedor y el
 * delivery. Sale de las líneas de las ventas cobradas: cada una anota qué promoción se le aplicó, si es la parte regalada y a qué precio
 * estaba antes (`precioAntesPromo`), así que
 *
 *     ahorro de una línea = (precio de antes − precio cobrado) × cantidad
 *
 * es lo que el cliente dejó de pagar: un descuento en las líneas con rebaja, y el valor de lo regalado (a precio de lista) en las de
 * cortesía. Es lo cobrado de cada línea ANTES del descuento general de la cuenta, que es otra cosa y tiene su propio reporte.
 *
 * Todos los montos de una línea se redondean al guaraní ANTES de sumarse: así la fila de total siempre es la suma exacta de las filas que
 * se ven (una cuenta dividida en partes iguales puede dejar línea con decimales). Las ventas anuladas no entran: el que arma la lista de
 * líneas ya las dejó afuera.
 */

export type Canal = "mostrador" | "comedor" | "delivery";
export const CANALES: Canal[] = ["mostrador", "comedor", "delivery"];
export const NOMBRE_DE_CANAL: Record<Canal, string> = { mostrador: "Mostrador", comedor: "Comedor", delivery: "Delivery" };

/** Una línea de una venta cobrada que llevó una promoción. */
export type LineaVendida = {
  ventaId: string;
  promocionId: string;
  productId: string | null;
  nombreProducto: string;
  cantidad: number;
  precioUnitario: number;
  /** null = no se guardó (ventas anteriores a este reporte): el ahorro de esa línea no se puede calcular y no se cuenta. */
  precioAntesPromo: number | null;
  cortesia: boolean;
  costoProducto: number | null;
  costoAgregados: number | null;
  canal: Canal;
};

export type Totales = {
  /** Ventas distintas (tickets) que llevaron la promoción. */
  ventas: number;
  /** Unidades con la promoción: las que se pagaron y las regaladas. */
  unidades: number;
  regaladas: number;
  /** Lo cobrado de esas líneas (antes del descuento general de la cuenta). */
  cobrado: number;
  /** Lo que se descontó en las líneas con rebaja. */
  descontado: number;
  /** Lo que valían, a precio de lista, las unidades regaladas. */
  regalado: number;
  /** descontado + regalado. */
  ahorro: number;
  /** Lo que costó producir lo regalado, con las recetas que tienen costo; ver `costoIncompleto`. */
  costoRegalado: number;
  /** true si alguna unidad regalada no tiene el costo cargado: el costo de arriba es parcial. */
  costoIncompleto: boolean;
};

export type EstadoDePromo = "activa" | "inactiva" | "eliminada";

export type FilaPromo = Totales & {
  promocionId: string;
  nombre: string;
  /** "−20 %", "2x1"; null si la promoción ya no existe. */
  etiqueta: string | null;
  estado: EstadoDePromo;
};

export type FilaProducto = Totales & {
  promocionId: string;
  promocion: string;
  productId: string | null;
  producto: string;
};

export type FilaCanal = Totales & { canal: Canal; nombre: string };

export type ReportePromociones = {
  filas: FilaPromo[];
  productos: FilaProducto[];
  canales: FilaCanal[];
  totales: Totales;
  /** Líneas con promoción a las que les falta el precio de antes (no suman ahorro). */
  lineasSinPrecioAnterior: number;
};

class Acumulador {
  ventas = new Set<string>();
  unidades = 0;
  regaladas = 0;
  cobrado = 0;
  descontado = 0;
  regalado = 0;
  costoRegalado = 0;
  costoIncompleto = false;

  sumar(l: LineaVendida, m: MontosDeLinea) {
    this.ventas.add(l.ventaId);
    this.unidades += l.cantidad;
    this.cobrado += m.cobrado;
    if (l.cortesia) {
      this.regaladas += l.cantidad;
      this.regalado += m.ahorro;
      if (m.costo === null) this.costoIncompleto = true;
      else this.costoRegalado += m.costo;
    } else {
      this.descontado += m.ahorro;
    }
  }

  cerrar(): Totales {
    return {
      ventas: this.ventas.size,
      unidades: redondearCantidad(this.unidades),
      regaladas: redondearCantidad(this.regaladas),
      cobrado: this.cobrado,
      descontado: this.descontado,
      regalado: this.regalado,
      ahorro: this.descontado + this.regalado,
      costoRegalado: this.costoRegalado,
      costoIncompleto: this.costoIncompleto,
    };
  }
}

type MontosDeLinea = { cobrado: number; ahorro: number; costo: number | null };

/** Las cantidades pueden tener decimales (0,5 al dividir una cuenta en partes iguales): se limpian los restos de la suma. */
function redondearCantidad(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/** Los montos de una línea, ya en guaraníes enteros. */
export function montosDeLinea(l: LineaVendida): MontosDeLinea {
  const cobrado = Math.round(l.precioUnitario * l.cantidad);
  const ahorro = l.precioAntesPromo === null ? 0 : Math.max(0, Math.round((l.precioAntesPromo - l.precioUnitario) * l.cantidad));
  // Lo que costó lo regalado: el producto y, solo si los agregados también salieron gratis (la línea quedó en 0), los agregados.
  let costo: number | null = null;
  if (l.cortesia && l.costoProducto !== null) {
    const agregadosGratis = l.precioUnitario === 0;
    if (!agregadosGratis) costo = Math.round(l.costoProducto * l.cantidad);
    else if (l.costoAgregados !== null) costo = Math.round((l.costoProducto + l.costoAgregados) * l.cantidad);
  }
  return { cobrado, ahorro, costo };
}

export function resumirPromociones(lineas: LineaVendida[], promos: PromoDef[]): ReportePromociones {
  const porId = new Map(promos.map((p) => [p.id, p]));
  const porPromo = new Map<string, Acumulador>();
  const porProducto = new Map<string, { promocionId: string; productId: string | null; nombre: string; acc: Acumulador }>();
  const porCanal = new Map<Canal, Acumulador>(CANALES.map((c) => [c, new Acumulador()]));
  const total = new Acumulador();
  let sinPrecioAnterior = 0;

  for (const l of lineas) {
    const m = montosDeLinea(l);
    if (l.precioAntesPromo === null) sinPrecioAnterior += 1;

    const acPromo = porPromo.get(l.promocionId) ?? new Acumulador();
    porPromo.set(l.promocionId, acPromo);
    acPromo.sumar(l, m);

    // Un producto es el mismo si tiene el mismo id (o, sin id, el mismo nombre).
    const claveProducto = `${l.promocionId}\u0001${l.productId ?? `n:${l.nombreProducto}`}`;
    const prod = porProducto.get(claveProducto) ?? { promocionId: l.promocionId, productId: l.productId, nombre: l.nombreProducto, acc: new Acumulador() };
    porProducto.set(claveProducto, prod);
    prod.acc.sumar(l, m);

    porCanal.get(l.canal)!.sumar(l, m);
    total.sumar(l, m);
  }

  const datosDe = (id: string): { nombre: string; etiqueta: string | null; estado: EstadoDePromo } => {
    const p = porId.get(id);
    if (!p) return { nombre: `Promoción eliminada (…${id.slice(-4)})`, etiqueta: null, estado: "eliminada" };
    return { nombre: p.nombre, etiqueta: etiquetaDePromo(p), estado: p.activa ? "activa" : "inactiva" };
  };

  const filas: FilaPromo[] = [...porPromo.entries()].map(([promocionId, acc]) => ({ promocionId, ...datosDe(promocionId), ...acc.cerrar() }));
  filas.sort((a, b) => b.ahorro - a.ahorro || b.unidades - a.unidades || a.nombre.localeCompare(b.nombre, "es"));

  const productos: FilaProducto[] = [...porProducto.values()].map((p) => ({
    promocionId: p.promocionId,
    promocion: datosDe(p.promocionId).nombre,
    productId: p.productId,
    producto: p.nombre,
    ...p.acc.cerrar(),
  }));
  productos.sort((a, b) => b.ahorro - a.ahorro || b.unidades - a.unidades || a.producto.localeCompare(b.producto, "es"));

  const canales: FilaCanal[] = CANALES.map((canal) => ({ canal, nombre: NOMBRE_DE_CANAL[canal], ...porCanal.get(canal)!.cerrar() }));

  return { filas, productos, canales, totales: total.cerrar(), lineasSinPrecioAnterior: sinPrecioAnterior };
}
