"use server";

import { exigirPermiso } from "@/lib/auth";
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

export type ResultadoPedidoAccion = { ok: true } | { ok: false; error: string };

/**
 * Devuelve un resultado en vez de lanzar los errores de validación: Next.js
 * oculta en producción el mensaje de cualquier `throw` que salga de una
 * Server Action, así que el motivo real solo llega si viaja en el retorno.
 */
export async function cambiarEstadoPedido(
  orderId: string,
  estado: string
): Promise<ResultadoPedidoAccion> {
  await exigirPermiso("pedidos.cambiarEstado");
  // Todas las consultas de acá abajo quedan atadas a este local.
  const prisma = prismaDelLocal(await idLocalActual());

  if (!ESTADOS_VALIDOS.includes(estado)) {
    return { ok: false, error: "Estado inválido" };
  }

  if (estado === "en_despacho") {
    const pedido = await prisma.order.findUnique({
      where: { id: orderId },
      select: { tipoEntrega: true, repartidorId: true },
    });
    if (pedido?.tipoEntrega === "delivery" && !pedido.repartidorId) {
      return {
        ok: false,
        error: 'Asigná un repartidor antes de pasar el pedido a "En despacho".',
      };
    }
  }

  await prisma.order.update({ where: { id: orderId }, data: { estado } });
  revalidatePath("/admin/pedidos");
  revalidatePath(`/admin/pedidos/${orderId}`);
  return { ok: true };
}

export async function asignarRepartidor(
  orderId: string,
  repartidorId: string
): Promise<ResultadoPedidoAccion> {
  await exigirPermiso("pedidos.asignarRepartidor");
  // Todas las consultas de acá abajo quedan atadas a este local.
  const prisma = prismaDelLocal(await idLocalActual());

  await prisma.order.update({
    where: { id: orderId },
    data: { repartidorId: repartidorId || null },
  });
  revalidatePath("/admin/pedidos");
  revalidatePath(`/admin/pedidos/${orderId}`);
  return { ok: true };
}
