"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { localPorSlug } from "@/lib/local-por-slug";
import { limiteDeEnvio } from "@/lib/pedido-vencimiento";
import { descartarPedidoSinEnviar } from "@/lib/pedidos-sin-enviar";

/**
 * Marca que el cliente efectivamente apretó "Enviar por WhatsApp".
 * Sirve para que el panel distinga los pedidos realmente enviados de los
 * que quedaron armados a medias, sin que el encargado tenga que adivinar.
 *
 * Solo vale dentro del tiempo que da el pedido (ver `pedido-vencimiento.ts`): si ya venció, el pedido se cancela y se borra,
 * y se devuelve `vencido` para que la pantalla lo diga y mande a armarlo de nuevo. Un pedido que una persona del local ya
 * confirmó, o que ya se había marcado, se marca igual (tocar el botón dos veces no rompe nada).
 */
export async function marcarEnviadoWhatsapp(
  slug: string,
  orderId: string
): Promise<{ ok: boolean; vencido?: boolean }> {
  const local = await localPorSlug(slug);
  if (typeof orderId !== "string" || !orderId) return { ok: false };
  const ahora = new Date();

  // updateMany en vez de update: si el pedido no pertenece a este local, no
  // actualiza nada, en lugar de tocar el de otro negocio.
  const marcado = await prisma.order.updateMany({
    where: {
      id: orderId,
      storeId: local.id,
      OR: [{ enviadoWhatsapp: true }, { estado: { not: "pendiente" } }, { createdAt: { gte: limiteDeEnvio(ahora) } }],
    },
    data: { enviadoWhatsapp: true },
  });
  if (marcado.count === 1) {
    revalidatePath("/admin/pedidos");
    return { ok: true };
  }

  // No se marcó: o venció (se borra ahora, si todavía no lo hizo la tarea programada) o ya no existe.
  await descartarPedidoSinEnviar({ id: orderId, storeId: local.id }, ahora);
  revalidatePath("/admin/pedidos");
  return { ok: false, vencido: true };
}
