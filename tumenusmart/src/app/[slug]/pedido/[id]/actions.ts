"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { localPorSlug } from "@/lib/local-por-slug";

/**
 * Marca que el cliente efectivamente apretó "Enviar por WhatsApp".
 * Sirve para que el panel distinga los pedidos realmente enviados de los
 * que quedaron armados a medias, sin que el encargado tenga que adivinar.
 */
export async function marcarEnviadoWhatsapp(
  slug: string,
  orderId: string
): Promise<void> {
  const local = await localPorSlug(slug);

  // updateMany en vez de update: si el pedido no pertenece a este local, no
  // actualiza nada, en lugar de tocar el de otro negocio.
  await prisma.order.updateMany({
    where: { id: orderId, storeId: local.id },
    data: { enviadoWhatsapp: true },
  });
  revalidatePath("/admin/pedidos");
}
