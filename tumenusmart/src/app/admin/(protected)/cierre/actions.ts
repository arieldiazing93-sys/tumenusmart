"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { exigirPermiso } from "@/lib/auth";
import { resumirCierre } from "@/lib/rendicion";

/**
 * Recibir la plata de un repartidor y cerrar su vuelta.
 *
 * Los pedidos que entran quedan atados a la rendición y dejan de figurar como
 * pendientes. Los totales se copian a la rendición en vez de calcularse
 * después: si mañana alguien corrige el precio de un pedido de anoche, lo que
 * ya se recibió no puede moverse solo.
 */
export async function cerrarRendicion(
  repartidorId: string,
  notas: string
): Promise<{ ok: boolean; error?: string; efectivo?: number }> {
  const sesion = await exigirPermiso("rendiciones.gestionar");
  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);

  const repartidor = await db.repartidor.findUnique({
    where: { id: repartidorId },
    select: { id: true, storeId: true },
  });
  // El filtro por local ya lo aplica prismaDelLocal, pero se comprueba igual:
  // esta acción mueve plata y no es lugar para confiar en una sola defensa.
  if (!repartidor || repartidor.storeId !== storeId) {
    return { ok: false, error: "Ese repartidor no es de este local" };
  }

  const pedidos = await db.order.findMany({
    where: { repartidorId, estado: "entregado", rendicionId: null },
    select: { id: true, numero: true, total: true, cobroMetodo: true },
  });

  if (pedidos.length === 0) {
    return { ok: false, error: "Este repartidor no tiene nada pendiente de rendir" };
  }

  const resumen = resumirCierre(pedidos);

  await prisma.$transaction(async (tx) => {
    const rendicion = await tx.rendicion.create({
      data: {
        storeId,
        repartidorId,
        cantidadPedidos: resumen.cantidad,
        totalEfectivo: resumen.efectivo,
        totalOtros: resumen.otros,
        recibidoPor: sesion.nombre?.trim() || sesion.email,
        notas: notas.trim() || null,
      },
    });

    // Se marcan por id y no repitiendo el filtro: si mientras se cerraba
    // entró otra entrega, esa NO debe colarse en una rendición cuyos totales
    // ya se calcularon sin ella. Queda pendiente para la próxima vuelta.
    await tx.order.updateMany({
      where: { id: { in: pedidos.map((p) => p.id) } },
      data: { rendicionId: rendicion.id },
    });
  });

  revalidatePath("/admin/cierre");
  revalidatePath("/admin/pedidos");
  return { ok: true, efectivo: resumen.efectivo };
}
