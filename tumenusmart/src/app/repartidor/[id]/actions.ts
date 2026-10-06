"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

// Sin login: la "autenticación" acá es el propio id del repartidor en la
// URL — por eso siempre se verifica que la cuenta esté realmente asignada a
// ESE repartidor antes de dejarlo tocar nada.

export type ResultadoEntrega = { ok: true } | { ok: false; error: string };

/**
 * El repartidor marca una cuenta de delivery como entregada: es su ruta de trabajo y nada más.
 *
 * El dinero NO se mueve acá: lo cobra la caja (con "Cobrar cuenta"). Si la cuenta todavía no se cobró, el repartidor cobra al cliente
 * y trae la plata a la caja; si ya estaba paga, solo entrega. Marcarla entregada deja la hora y, si la cuenta ya estaba cobrada, hace
 * que desaparezca de la lista de Servicio delivery.
 *
 * Devuelve {ok,error} en vez de lanzar: Next.js esconde el mensaje real de cualquier excepción que escape de una Server Action en
 * producción (queda un genérico "Application error"), así que un `throw` acá no le diría al repartidor POR QUÉ no se pudo marcar.
 */
export async function marcarCuentaEntregada(repartidorId: string, cuentaId: string): Promise<ResultadoEntrega> {
  const [repartidor, cuenta] = await Promise.all([
    prisma.repartidor.findUnique({
      where: { id: String(repartidorId) },
      select: { storeId: true, activo: true },
    }),
    prisma.cuentaDelivery.findUnique({
      where: { id: String(cuentaId) },
      select: { repartidorId: true, entrega: true, estado: true, storeId: true },
    }),
  ]);

  // Dos condiciones, no una: la cuenta tiene que estar asignada a este repartidor Y pertenecer a su mismo local. La segunda sobra
  // hoy, pero deja de sobrar el día que alguien reasigne repartidores entre negocios.
  if (
    !repartidor ||
    !repartidor.activo ||
    !cuenta ||
    cuenta.repartidorId !== repartidorId ||
    cuenta.storeId !== repartidor.storeId
  ) {
    return { ok: false, error: "Este pedido no está asignado a este repartidor." };
  }
  if (cuenta.estado === "anulada") return { ok: false, error: "Este pedido se canceló." };
  if (cuenta.entrega !== "en_ruta") return { ok: false, error: "Este pedido ya no está en ruta." };

  // La condición va en el update: si la caja la canceló o la cambió en el mismo instante, acá no encuentra nada que marcar.
  const marcada = await prisma.cuentaDelivery.updateMany({
    where: { id: String(cuentaId), storeId: repartidor.storeId, repartidorId, entrega: "en_ruta", estado: { not: "anulada" } },
    data: { entrega: "entregada", entregadaEn: new Date() },
  });
  if (marcada.count !== 1) return { ok: false, error: "Este pedido ya no está en ruta." };

  revalidatePath(`/repartidor/${repartidorId}`);
  revalidatePath("/admin/delivery");
  return { ok: true };
}
