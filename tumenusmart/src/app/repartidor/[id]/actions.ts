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
 * El repartidor marca un pedido como entregado: es su ruta de trabajo y nada más.
 *
 * El dinero NO se mueve acá: el pedido ya llegó cobrado y facturado desde la caja (se cobra al cargarlo a mano). Lo que queda de
 * la entrega es el control del efectivo: se guarda en `cobroMetodo` CÓMO se cobró en la caja (efectivo, transferencia…), para que la
 * Rendición sepa cuánto efectivo tiene que traer de vuelta. Eso ya NO suma nada a la caja del turno (ya estaba sumado al cobrarlo).
 *
 * Devuelve {ok,error} en vez de lanzar: Next.js esconde el mensaje real de
 * cualquier excepción que escape de una Server Action en producción (queda
 * un genérico "Application error"), así que un `throw` acá no le dice al
 * repartidor POR QUÉ no se pudo marcar — solo que algo falló.
 */
export async function marcarPedidoEntregado(
  repartidorId: string,
  orderId: string
): Promise<ResultadoEntrega> {
  const [repartidor, pedido] = await Promise.all([
    prisma.repartidor.findUnique({
      where: { id: repartidorId },
      select: { storeId: true, activo: true },
    }),
    prisma.order.findUnique({
      where: { id: orderId },
      select: { repartidorId: true, estado: true, storeId: true, formaPagoPos: true },
    }),
  ]);

  // Dos condiciones, no una: el pedido tiene que estar asignado a este
  // repartidor Y pertenecer a su mismo local. La segunda sobra hoy, pero
  // deja de sobrar el día que alguien reasigne repartidores entre negocios.
  if (
    !repartidor ||
    !repartidor.activo ||
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
      // La forma de cobro sale de lo que se cobró en la caja, nunca del teléfono del repartidor. `normalizarCobro` deja pasar
      // solo las formas conocidas (ver FORMAS_DE_COBRO en src/lib/rendicion.ts) y, ante cualquier otra cosa (un pedido viejo que
      // quedó sin cobrar), cuenta como efectivo — que es el lado seguro: queda como plata a rendir en vez de desaparecer.
      cobroMetodo: normalizarCobro(pedido.formaPagoPos),
      entregadoEn: new Date(),
    },
  });
  revalidatePath(`/repartidor/${repartidorId}`);
  revalidatePath("/admin/pedidos");
  revalidatePath(`/admin/pedidos/${orderId}`);
  revalidatePath("/admin/cierre");
  return { ok: true };
}
