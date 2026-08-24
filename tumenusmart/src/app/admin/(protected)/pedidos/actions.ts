"use server";

import { revalidatePath } from "next/cache";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";

const ESTADOS_VALIDOS = [
  "pendiente",
  "confirmado",
  "en_preparacion",
  "en_despacho",
  "entregado",
  "cancelado",
];

export async function cambiarEstadoPedido(orderId: string, estado: string) {
  // Todas las consultas de acá abajo quedan atadas a este local.
  const prisma = prismaDelLocal(await idLocalActual());

  if (!ESTADOS_VALIDOS.includes(estado)) {
    throw new Error("Estado inválido");
  }

  if (estado === "en_despacho") {
    const pedido = await prisma.order.findUnique({
      where: { id: orderId },
      select: { tipoEntrega: true, repartidorId: true },
    });
    if (pedido?.tipoEntrega === "delivery" && !pedido.repartidorId) {
      throw new Error(
        'Asigná un repartidor antes de pasar el pedido a "En despacho".'
      );
    }
  }

  await prisma.order.update({ where: { id: orderId }, data: { estado } });
  revalidatePath("/admin/pedidos");
  revalidatePath(`/admin/pedidos/${orderId}`);
}

export async function asignarRepartidor(orderId: string, repartidorId: string) {
  // Todas las consultas de acá abajo quedan atadas a este local.
  const prisma = prismaDelLocal(await idLocalActual());

  await prisma.order.update({
    where: { id: orderId },
    data: { repartidorId: repartidorId || null },
  });
  revalidatePath("/admin/pedidos");
  revalidatePath(`/admin/pedidos/${orderId}`);
}
