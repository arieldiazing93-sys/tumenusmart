"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { normalizarCobro } from "@/lib/rendicion";

// Sin login: la "autenticación" acá es el propio id del repartidor en la
// URL (igual criterio que /pedido/[id] para el cliente) — por eso siempre
// se verifica que el pedido esté realmente asignado a ESE repartidor antes
// de dejarlo tocar nada.

export type ResultadoEntrega = { ok: true } | { ok: false; error: string };

/**
 * El repartidor marca un pedido como entregado y dice CÓMO le pagaron.
 *
 * Las dos cosas van juntas en un solo paso a propósito. Si la forma de cobro
 * se cargara después, en la puerta se aprieta "entregado" y el dato se
 * completa —o no— cuando ya nadie se acuerda si aquel fue el que pagó con
 * tarjeta. Preguntándolo en el momento, la respuesta es la de alguien que
 * acaba de tener la plata en la mano.
 *
 * Devuelve {ok,error} en vez de lanzar: Next.js esconde el mensaje real de
 * cualquier excepción que escape de una Server Action en producción (queda
 * un genérico "Application error"), así que un `throw` acá no le dice al
 * repartidor POR QUÉ no se pudo marcar — solo que algo falló.
 */
export async function marcarPedidoEntregado(
  repartidorId: string,
  orderId: string,
  cobro: string
): Promise<ResultadoEntrega> {
  const [repartidor, pedido] = await Promise.all([
    prisma.repartidor.findUnique({
      where: { id: repartidorId },
      select: { storeId: true },
    }),
    prisma.order.findUnique({
      where: { id: orderId },
      select: { repartidorId: true, estado: true, storeId: true },
    }),
  ]);

  // Dos condiciones, no una: el pedido tiene que estar asignado a este
  // repartidor Y pertenecer a su mismo local. La segunda sobra hoy, pero
  // deja de sobrar el día que alguien reasigne repartidores entre negocios.
  if (
    !repartidor ||
    !pedido ||
    pedido.repartidorId !== repartidorId ||
    pedido.storeId !== repartidor.storeId
  ) {
    return { ok: false, error: "Este pedido no está asignado a este repartidor." };
  }
  if (pedido.estado !== "en_despacho") {
    return { ok: false, error: "Este pedido ya no está en despacho." };
  }

  await prisma.order.update({
    where: { id: orderId },
    data: {
      estado: "entregado",
      // Nunca se guarda lo que llegó tal cual: viene del teléfono del
      // repartidor. `normalizarCobro` deja pasar solo las cuatro formas
      // conocidas y, ante cualquier otra cosa, cuenta como efectivo — que es
      // el lado seguro: el pedido queda como plata a rendir en vez de
      // desaparecer de la cuenta.
      cobroMetodo: normalizarCobro(cobro),
      entregadoEn: new Date(),
    },
  });
  revalidatePath(`/repartidor/${repartidorId}`);
  revalidatePath("/admin/pedidos");
  revalidatePath(`/admin/pedidos/${orderId}`);
  revalidatePath("/admin/cierre");
  return { ok: true };
}
