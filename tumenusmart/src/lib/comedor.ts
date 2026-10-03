/**
 * Servicio comedor — la lógica que no toca la base (se puede probar sin Prisma).
 *
 * El mozo carga la cuenta de una mesa desde su celular o tablet; cada "Enviar" es una ronda de esa cuenta y manda una
 * comanda a cada impresora (Cocina, Barra...) según el área del producto. Acá viven las reglas del número de mesa y el
 * armado del texto de la comanda.
 */

import { armarDocumento, centrado, filaTabla, negrita, separador } from "./escpos";
import { formatearGuarani, formatearMiles, formatearNumero, sinAcentos } from "./format";
import { calcularDescuento, textoPorcentaje, type DescuentoPedido } from "./descuento-venta";

/** Hasta cuántas letras puede tener el número o nombre de una mesa ("5", "Terraza 2"). */
export const MESA_LARGO_MAXIMO = 20;
/** Hasta cuántas letras puede tener la nota que el mozo le deja a la cocina en un producto. */
export const NOTA_LARGO_MAXIMO = 120;
/** Hasta cuántos segundos atrás cuenta el último latido de una estación para decir que "está imprimiendo". */
export const SEGUNDOS_LATIDO_IMPRESION = 25;
/** Cuántos trabajos de impresión entrega cada consulta de la estación (para no cargarla de golpe). */
export const TRABAJOS_POR_CONSULTA = 5;
/** Pasado este tiempo, un trabajo "imprimiendo" que nadie terminó vuelve a la fila (la estación se cayó a la mitad). */
export const SEGUNDOS_TRABAJO_COLGADO = 60;
/** Cuántas veces se reintenta un trabajo que dio error antes de dejarlo para revisar a mano. */
export const REINTENTOS_MAXIMOS = 3;

/**
 * Un texto sin caracteres de control (los de código 0 a 31 y el 127): lo que escribe el mozo no puede llevar comandos de la
 * impresora (cortar el papel, cambiar la letra) ni bytes 0x00, que la base de datos no acepta.
 */
function sinControles(texto: string): string {
  return texto.replace(/[\x00-\x1F\x7F]/g, " ");
}

/**
 * El número o nombre de la mesa como se muestra: sin espacios de más y con un largo razonable. Devuelve null si no
 * queda nada (o si es demasiado largo).
 */
export function normalizarMesa(texto: unknown): string | null {
  const limpio = sinControles(String(texto ?? "")).replace(/\s+/g, " ").trim();
  if (!limpio || limpio.length > MESA_LARGO_MAXIMO) return null;
  return limpio;
}

/**
 * La clave con la que se reconoce a una mesa: sin mayúsculas, acentos ni espacios repetidos, para que "Mesa 5", "mesa 5"
 * y "MESA  5" sean la misma mesa y no se puedan abrir dos cuentas a la vez en ella.
 */
export function claveDeMesa(mesa: string): string {
  return mesa
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** La nota de un producto, limpia y con tope; null si no escribió nada. */
export function normalizarNota(texto: unknown): string | null {
  const limpio = sinControles(String(texto ?? "")).replace(/\s+/g, " ").trim().slice(0, NOTA_LARGO_MAXIMO);
  return limpio || null;
}

/** Lo que se imprime de cada producto en la comanda. */
export type LineaComanda = {
  cantidad: number;
  nombre: string;
  /** "Extra queso, Cheddar" */
  opciones?: string | null;
  /** "Sin: tomate, cebolla" */
  quitados?: string | null;
  /** La nota del mozo para la cocina. */
  nota?: string | null;
};

/**
 * La comanda de UN área (Cocina, Barra...) para una ronda de una mesa, en texto crudo ESC/POS listo para la impresora
 * térmica (mismos helpers que el resto de los comprobantes, ver escpos.ts). Sin acentos ni eñes: la impresora en modo
 * "Generic / Text Only" los muestra mal, igual que pasaba con el ticket.
 */
export function textoComanda(datos: {
  mesa: string;
  mozo: string;
  ronda: number;
  area: string;
  /** La hora ya formateada ("03/10 12:45"). */
  hora: string;
  lineas: LineaComanda[];
}): string {
  // Sin acentos y sin caracteres de control: nada de lo que viene de afuera puede colar comandos de impresora en la comanda.
  const s = (texto: string) => sinControles(sinAcentos(texto));
  const l: string[] = [separador()];
  l.push(negrita(centrado(s(`MESA ${datos.mesa}`).toUpperCase())));
  l.push(centrado(s(datos.area).toUpperCase()));
  l.push(separador());
  l.push(`${datos.hora}   Pedido ${datos.ronda}`);
  l.push(s(`Mozo: ${datos.mozo}`));
  l.push(separador());
  for (const x of datos.lineas) {
    l.push(s(`${x.cantidad} x ${x.nombre}`).toUpperCase());
    if (x.opciones) l.push(s(`  + ${x.opciones}`));
    if (x.quitados) l.push(`  ${negrita(s(`** ${x.quitados} **`))}`);
    if (x.nota) l.push(s(`  >> ${x.nota}`));
  }
  l.push(separador());
  return armarDocumento(l);
}

// Los comandos de la impresora (negrita apagada, corte de papel) llevan el byte 0x00, y PostgreSQL no deja guardar ese byte
// en un campo de texto ("invalid byte sequence for encoding UTF8: 0x00"). Se guarda una marca en su lugar y se vuelve a
// poner el byte justo antes de imprimir. U+E000 es un carácter de uso privado: no aparece en ningún texto real.
const MARCA_NUL = String.fromCharCode(0xe000);

/** El texto de una comanda tal como se guarda en la base: sin bytes 0x00. */
export function contenidoParaGuardar(texto: string): string {
  return texto.split(MARCA_NUL).join("").replace(/\x00/g, MARCA_NUL);
}

/** Lo que se le manda a la impresora: el texto guardado con los bytes 0x00 de vuelta en su lugar. */
export function contenidoParaImprimir(guardado: string): string {
  return guardado.split(MARCA_NUL).join("\x00");
}

/**
 * La comanda tal como se lee en pantalla: sin los comandos de la impresora (inicio, negrita, corte), que solo ella entiende.
 * Sirve para ver qué se va a imprimir sin gastar papel (o cuando la "impresora" es un PDF y no entiende ESC/POS).
 */
export function comandaLegible(guardado: string): string {
  return contenidoParaImprimir(guardado)
    .replace(/\x1B\x40|\x1B\x45[\x00\x01]|\x1D\x56[\x00-\x03]/g, "")
    .replace(/[\x00-\x09\x0B-\x1F]/g, "")
    .trim();
}

/** Lo que vale una lista de productos de una cuenta (precio de cada uno por su cantidad). */
export function totalDeLineas(lineas: { precioUnitario: number; cantidad: number }[]): number {
  return lineas.reduce((suma, x) => suma + x.precioUnitario * x.cantidad, 0);
}

/**
 * Agrupa por Área de Impresión. Los productos sin área quedan afuera a propósito: no salen en ninguna comanda, igual que
 * en los pedidos de la carta y el Punto de Venta.
 */
export function agruparPorArea<T extends { areaImpresionId: string | null }>(lineas: T[]): Map<string, T[]> {
  const mapa = new Map<string, T[]>();
  for (const x of lineas) {
    if (!x.areaImpresionId) continue;
    const grupo = mapa.get(x.areaImpresionId);
    if (grupo) grupo.push(x);
    else mapa.set(x.areaImpresionId, [x]);
  }
  return mapa;
}

/** Los insumos que descontó un producto al enviarse, tal como se guardan para poder devolverlos al anularlo. */
export type ConsumoGuardado = { insumoId: string; almacenId: string | null; cantidad: number };

// ---------------------------------------------------------------------------------------------------------------------
//  La cuenta que opera la caja (Fase 2)
// ---------------------------------------------------------------------------------------------------------------------

/** Los estados en que una mesa sigue ocupada: la cuenta todavía no se pagó ni se canceló. */
export const ESTADOS_CUENTA_ABIERTA = ["abierta", "por_cobrar"] as const;

/** Lo que dice el estado de una cuenta, en palabras del salón. */
export function textoEstadoCuenta(estado: string): string {
  if (estado === "abierta") return "Abierta";
  if (estado === "por_cobrar") return "Cuenta impresa";
  if (estado === "pagada") return "Pagada";
  return "Cancelada";
}

/** El descuento guardado en la cuenta, como lo entiende `calcularDescuento`; null si no tiene ninguno. */
export function descuentoDeCuenta(cuenta: { descuentoTipo: string | null; descuentoValor: unknown }): DescuentoPedido | null {
  if (cuenta.descuentoTipo !== "porcentaje" && cuenta.descuentoTipo !== "monto") return null;
  const valor = Number(cuenta.descuentoValor);
  if (!Number.isFinite(valor) || valor <= 0) return null;
  return { tipo: cuenta.descuentoTipo, valor };
}

export type TotalesDeCuenta = {
  subtotal: number;
  /** Guaraníes que se restan (0 si no hay descuento). */
  descuento: number;
  porcentaje: number | null;
  /** Lo que se cobra. */
  total: number;
  /** Si el descuento ya no corresponde (se cancelaron productos y quedó igual o mayor a la cuenta): el motivo. */
  descuentoInvalido: string | null;
};

/**
 * Lo que vale una cuenta con su descuento. Se calcula siempre sobre los productos que siguen activos, así que si se
 * cancela algo el descuento por porcentaje se ajusta solo. Un descuento en monto fijo que ya no cabe en la cuenta no se
 * aplica y se avisa (`descuentoInvalido`): no se puede cobrar así hasta que la caja lo corrija.
 */
export function totalesDeCuenta(
  lineas: { precioUnitario: number; cantidad: number }[],
  pedido: DescuentoPedido | null
): TotalesDeCuenta {
  const subtotal = totalDeLineas(lineas);
  const calculado = calcularDescuento(subtotal, pedido);
  if (!calculado.ok) {
    return { subtotal, descuento: 0, porcentaje: null, total: subtotal, descuentoInvalido: calculado.error };
  }
  return {
    subtotal,
    descuento: calculado.monto,
    porcentaje: calculado.porcentaje,
    total: subtotal - calculado.monto,
    descuentoInvalido: null,
  };
}

/**
 * La cuenta de la mesa para entregar al cliente (no es una factura), en texto crudo ESC/POS. Sale en la impresora del
 * ticket de la estación de caja. Mismos helpers y mismo ancho que el resto de los comprobantes.
 */
export function textoCuenta(datos: {
  local: string;
  mesa: string;
  numero: number;
  mozo: string;
  /** La hora ya formateada ("03/10 12:45"). */
  hora: string;
  lineas: (LineaComanda & { precioUnitario: number })[];
  totales: TotalesDeCuenta;
}): string {
  const s = (texto: string) => sinControles(sinAcentos(texto));
  const l: string[] = [separador()];
  l.push(negrita(centrado(s(datos.local).toUpperCase())));
  l.push(centrado("CUENTA - NO ES FACTURA"));
  l.push(separador());
  l.push(s(`Mesa ${datos.mesa}   Cuenta ${formatearNumero(datos.numero)}`));
  l.push(s(`Mozo: ${datos.mozo}`));
  l.push(datos.hora);
  l.push(separador());
  l.push(filaTabla("Ctd", "Descripcion", "Importe"));
  for (const x of datos.lineas) {
    l.push(filaTabla(String(x.cantidad), s(x.nombre), formatearMiles(x.precioUnitario * x.cantidad)));
    if (x.opciones) l.push(s(`  + ${x.opciones}`));
  }
  l.push(separador());
  const t = datos.totales;
  if (t.descuento > 0) {
    l.push(`SUBTOTAL: ${formatearGuarani(t.subtotal)}`);
    l.push(`DESCUENTO${t.porcentaje != null ? ` ${textoPorcentaje(t.porcentaje)}%` : ""}: -${formatearGuarani(t.descuento)}`);
  }
  l.push(negrita(`TOTAL: ${formatearGuarani(t.total)}`));
  l.push(separador());
  l.push(centrado("Gracias por su visita"));
  return armarDocumento(l);
}

/** El aviso para la cocina o la barra de que un producto que ya se había pedido se cancela: que no lo preparen. */
export function textoAnulacion(datos: {
  mesa: string;
  area: string;
  /** La hora ya formateada ("03/10 12:45"). */
  hora: string;
  quien: string;
  cantidad: number;
  nombre: string;
  opciones?: string | null;
  motivo: string;
}): string {
  const s = (texto: string) => sinControles(sinAcentos(texto));
  const l: string[] = [separador()];
  l.push(negrita(centrado("*** ANULADO ***")));
  l.push(negrita(centrado(s(`MESA ${datos.mesa}`).toUpperCase())));
  l.push(centrado(s(datos.area).toUpperCase()));
  l.push(separador());
  l.push(datos.hora);
  l.push(s(`Anulo: ${datos.quien}`));
  l.push(separador());
  l.push(s(`${datos.cantidad} x ${datos.nombre}`).toUpperCase());
  if (datos.opciones) l.push(s(`  + ${datos.opciones}`));
  l.push(s(`Motivo: ${datos.motivo}`));
  l.push(separador());
  return armarDocumento(l);
}

/** Lo que descontó un producto al enviarse, tal como quedó guardado (se ignora lo que no tenga la forma esperada). */
export function leerConsumoGuardado(valor: unknown): ConsumoGuardado[] {
  if (!Array.isArray(valor)) return [];
  const lista: ConsumoGuardado[] = [];
  for (const x of valor) {
    if (x && typeof x === "object" && !Array.isArray(x)) {
      const o = x as { insumoId?: unknown; almacenId?: unknown; cantidad?: unknown };
      if (typeof o.insumoId === "string" && typeof o.cantidad === "number") {
        lista.push({
          insumoId: o.insumoId,
          almacenId: typeof o.almacenId === "string" ? o.almacenId : null,
          cantidad: o.cantidad,
        });
      }
    }
  }
  return lista;
}
