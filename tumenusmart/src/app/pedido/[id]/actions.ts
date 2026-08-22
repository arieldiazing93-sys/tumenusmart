"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

/**
 * Marca que el cliente efectivamente apretó "Enviar por WhatsApp".
 * Sirve para que el panel distingue los pedidos realmente enviados de los
 * que quedaron armados a medias, sin que el encargado tenga que adivinar.
 */
export async function marcarEnviadoWhatsapp(orderId: string): Promise<void> {
  await prisma.order.update({
    where: { id: orderId },
    data: { enviadoWhatsapp: true },
  });
  revalidatePath("/admin/pedidos");
}
