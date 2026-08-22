"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

/**
 * Confirma que el cliente efectivamente abrió WhatsApp para mandar la
 * reserva. Recién a partir de acá la reserva aparece en el calendario del
 * panel: antes es solo un formulario a medio completar.
 */
export async function marcarReservaEnviada(reservationId: string): Promise<void> {
  await prisma.reservation.update({
    where: { id: reservationId },
    data: { enviadoWhatsapp: true },
  });
  revalidatePath("/admin/reservas");
}
