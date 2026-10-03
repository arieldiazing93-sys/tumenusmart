/**
 * Servicio comedor — la lógica que no toca la base (se puede probar sin Prisma).
 *
 * El mozo carga la cuenta de una mesa desde su celular o tablet; cada "Enviar" es una ronda de esa cuenta y manda una
 * comanda a cada impresora (Cocina, Barra...) según el área del producto. Acá viven las reglas del número de mesa y el
 * armado del texto de la comanda.
 */

import { armarDocumento, centrado, negrita, separador } from "./escpos";
import { sinAcentos } from "./format";

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
 * El número o nombre de la mesa como se muestra: sin espacios de más y con un largo razonable. Devuelve null si no
 * queda nada (o si es demasiado largo).
 */
export function normalizarMesa(texto: unknown): string | null {
  const limpio = String(texto ?? "").replace(/\s+/g, " ").trim();
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
  const limpio = String(texto ?? "").replace(/\s+/g, " ").trim().slice(0, NOTA_LARGO_MAXIMO);
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
  const s = sinAcentos;
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

/**
 * La comanda tal como se lee en pantalla: sin los comandos de la impresora (inicio, negrita, corte), que solo ella entiende.
 * Sirve para ver qué se va a imprimir sin gastar papel (o cuando la "impresora" es un PDF y no entiende ESC/POS).
 */
export function comandaLegible(contenido: string): string {
  return contenido
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
