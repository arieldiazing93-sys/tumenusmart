"use server";

import { exigirPermiso } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";

/**
 * Marca el premio de fidelización como entregado.
 *
 * El progreso se recalcula acá adentro, server-side — no se confía en lo que
 * mandó el botón del cliente, que solo sabe lo que vio en pantalla un
 * instante antes.
 */
export async function registrarCanjeFidelidad(telefono: string): Promise<void> {
  await exigirPermiso("fidelizacion.gestionar");
  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);

  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { fidelizacionActiva: true, fidelizacionUmbral: true },
  });
  if (!store?.fidelizacionActiva) {
    throw new Error("La fidelización no está activa para este local.");
  }

  const customer = await db.customer.findUnique({
    where: { storeId_telefono: { storeId, telefono } },
  });
  if (!customer) {
    throw new Error("No encontré a ese cliente.");
  }

  const entregados = await db.order.count({
    where: { clienteTelefono: telefono, estado: "entregado" },
  });
  if (entregados - customer.pedidosCanjeados < store.fidelizacionUmbral) {
    throw new Error("Este cliente todavía no llegó al umbral del premio.");
  }

  // Se SUMA el umbral y no se iguala al total entregado: si hizo 12 pedidos
  // y el umbral es 10, le quedan 2 de arranque para el próximo premio.
  await db.customer.update({
    where: { id: customer.id },
    data: { pedidosCanjeados: { increment: store.fidelizacionUmbral } },
  });
  revalidatePath("/admin/analytics");
}
