/**
 * Cuántas veces sale cada impresión en la estación (la computadora) desde la que se imprime.
 *
 * Cada estación decide, por área de impresión, cuántas copias salen (Estaciones → Impresoras por área): una cocina que quiere la
 * comanda dos veces, o un local que solo quiere la factura y deja el ticket en 0. Las copias del TICKET de venta son las del
 * área del ticket/factura de la estación; las de la FACTURA tienen su propio contador (`Estacion.copiasFactura`) porque las dos
 * salen por la misma impresora y hay locales que quieren una cosa y no la otra.
 *
 * Solo del servidor. Lo usan las rutas que entregan el texto de cada comprobante (`.../crudo/route.ts`): lo mandan en la
 * cabecera `X-Copias` y el navegador de la caja imprime esa cantidad (ver imprimirComprobante).
 */

import { estacionActual } from "./estacion-actual";
import type { PrismaLocal } from "./prisma-local";

/** El tope: más que esto no tiene sentido y evita que un valor roto llene la impresora. */
export const COPIAS_MAXIMAS = 9;

/** Un valor de copias válido (entero de 0 al tope); si no lo es, la normal: una copia. */
export function copiasValidas(valor: unknown): number {
  const n = Number(valor);
  return Number.isInteger(n) && n >= 0 && n <= COPIAS_MAXIMAS ? n : 1;
}

export type QueSeImprime = { area: string } | { documento: "ticket" | "factura" };

/**
 * Las copias que corresponden a lo que se va a imprimir, según la estación de ESTE navegador. Sin estación vinculada o sin la
 * impresora asignada no hay configuración que aplicar: una copia (lo normal).
 */
export async function copiasDeImpresion(db: PrismaLocal, que: QueSeImprime): Promise<number> {
  const estacion = await estacionActual(db);
  if (!estacion) return 1;

  if ("area" in que) {
    const fila = await db.estacionImpresora.findFirst({
      where: { estacionId: estacion.id, areaImpresionId: que.area },
      select: { copias: true },
    });
    return fila ? copiasValidas(fila.copias) : 1;
  }

  const datos = await db.estacion.findUnique({
    where: { id: estacion.id },
    select: { areaTicketId: true, copiasFactura: true },
  });
  if (!datos) return 1;
  if (que.documento === "factura") return copiasValidas(datos.copiasFactura);

  if (!datos.areaTicketId) return 1;
  const fila = await db.estacionImpresora.findFirst({
    where: { estacionId: estacion.id, areaImpresionId: datos.areaTicketId },
    select: { copias: true },
  });
  return fila ? copiasValidas(fila.copias) : 1;
}
