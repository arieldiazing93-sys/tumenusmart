"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

const ESTADOS_VALIDOS = [
  "pendiente",
  "confirmado",
  "en_preparacion",
  "en_despacho",
  "entregado",
  "cancelado",
];

export async function cambiarEstadoPedido(orderId: string, estado: string) {
  if (!ESTADOS_VALIDOS.includes(estado)) {
    throw new Error("Estado inválido");
  }
  await prisma.order.update({ where: { id: orderId }, data: { estado } });
  revalidatePath("/admin/pedidos");
  revalidatePath(`/admin/pedidos/${orderId}`);
}

export async function asignarRepartidor(orderId: string, repartidorId: string) {
  await prisma.order.update({
    where: { id: orderId },
    data: { repartidorId: repartidorId || null },
  });
  revalidatePath("/admin/pedidos");
  revalidatePath(`/admin/pedidos/${orderId}`);
}
