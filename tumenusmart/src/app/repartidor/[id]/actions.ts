"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

// Sin login: la "autenticación" acá es el propio id del repartidor en la
// URL (igual criterio que /pedido/[id] para el cliente) — por eso siempre
// se verifica que el pedido esté realmente asignado a ESE repartidor antes
// de dejarlo tocar nada.
export async function marcarPedidoEntregado(repartidorId: string, orderId: string) {
  const pedido = await prisma.order.findUnique({
    where: { id: orderId },
    select: { repartidorId: true, estado: true },
  });

  if (!pedido || pedido.repartidorId !== repartidorId) {
    throw new Error("Este pedido no está asignado a este repartidor.");
  }
  if (pedido.estado !== "en_despacho") {
    throw new Error("Este pedido ya no está en despacho.");
  }

  await prisma.order.update({ where: { id: orderId }, data: { estado: "entregado" } });
  revalidatePath(`/repartidor/${repartidorId}`);
  revalidatePath("/admin/pedidos");
  revalidatePath(`/admin/pedidos/${orderId}`);
}
