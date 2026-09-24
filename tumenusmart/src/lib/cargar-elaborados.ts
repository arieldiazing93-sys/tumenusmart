/**
 * Trae de la base todas las preparaciones (insumos elaborados) de un local,
 * listas para abrir una receta con `aplanarReceta` (ver insumo-elaborado.ts).
 *
 * Es UNA consulta chica por local — las preparaciones son pocas — y devuelve
 * un mapa vacío si el local no usa ninguna, así que quien la llama no tiene
 * que preguntar antes. Usa el cliente crudo con `storeId` explícito (igual que
 * stock-almacen.ts), de modo que sirve tanto para el POS como para el checkout
 * público, que no pasan por el mismo cliente.
 */

import { prisma } from "./prisma";
import { mapaDeElaborados, type MapaElaborados } from "./insumo-elaborado";

export async function cargarElaborados(storeId: string): Promise<MapaElaborados> {
  const filas = await prisma.insumo.findMany({
    where: { storeId, esElaborado: true },
    select: {
      id: true,
      rindeTanda: true,
      ingredientes: {
        select: {
          ingredienteId: true,
          cantidad: true,
          ingrediente: { select: { costoUnitario: true } },
        },
      },
    },
  });
  return mapaDeElaborados(filas);
}
