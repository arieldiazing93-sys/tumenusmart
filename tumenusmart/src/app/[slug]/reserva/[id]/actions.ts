"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { localPorSlug } from "@/lib/local-por-slug";

/**
 * Confirma que el cliente efectivamente abrió WhatsApp para mandar la
 * reserva. Recién a partir de acá la reserva aparece en el calendario del
 * panel: antes es solo un formulario a medio completar.
 */
export async function marcarReservaEnviada(
  slug: string,
  reservationId: string
): Promise<void> {
  const local = await localPorSlug(slug);

  // updateMany en vez de update: si la reserva no pertenece a este local, no
  // actualiza nada, en lugar de tocar la de otro negocio.
  await prisma.reservation.updateMany({
    where: { id: reservationId, storeId: local.id },
    data: { enviadoWhatsapp: true },
  });
  revalidatePath("/admin/reservas");
}
