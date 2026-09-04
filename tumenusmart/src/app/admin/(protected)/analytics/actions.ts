"use server";

import { exigirPermiso } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";

export type ResultadoCanje = { ok: true } | { ok: false; error: string };

/**
 * Marca el premio de fidelización como entregado.
 *
 * El progreso se recalcula acá adentro, server-side — no se confía en lo que
 * mandó el botón del cliente, que solo sabe lo que vio en pantalla un
 * instante antes.
 *
 * Devuelve un resultado en vez de lanzar los errores de validación: Next.js
 * oculta en producción el mensaje de cualquier `throw` que salga de una
 * Server Action (lo cambia por un genérico "Server Components render...",
 * por seguridad), así que el motivo real solo llega si viaja en el valor de
 * retorno, no en una excepción.
 */
export async function registrarCanjeFidelidad(telefono: string): Promise<ResultadoCanje> {
  await exigirPermiso("fidelizacion.gestionar");
  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);

  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { fidelizacionActiva: true, fidelizacionUmbral: true },
  });
  if (!store?.fidelizacionActiva) {
    return { ok: false, error: "La fidelización no está activa para este local." };
  }

  // Plain `prisma`, no `prismaDelLocal`: la clave compuesta storeId_telefono
  // ya fija el local sola.
  const customer = await prisma.customer.findUnique({
    where: { storeId_telefono: { storeId, telefono } },
  });
  if (!customer) {
    return { ok: false, error: "No encontré a ese cliente." };
  }

  const entregados = await db.order.count({
    where: { clienteTelefono: telefono, estado: "entregado" },
  });
  if (entregados - customer.pedidosCanjeados < store.fidelizacionUmbral) {
    return { ok: false, error: "Este cliente todavía no llegó al umbral del premio." };
  }

  // Se SUMA el umbral y no se iguala al total entregado: si hizo 12 pedidos
  // y el umbral es 10, le quedan 2 de arranque para el próximo premio.
  //
  // El "where" incluye pedidosCanjeados con el valor recién leído, a modo de
  // candado optimista: si dos clics (doble toque, o dos encargados a la vez)
  // llegan a la vez, el primero que escriba cambia ese valor y el segundo ya
  // no encuentra la fila con ese pedidosCanjeados — no la actualiza, y el
  // premio no se entrega dos veces por la misma tanda de pedidos.
  const resultado = await db.customer.updateMany({
    where: { id: customer.id, pedidosCanjeados: customer.pedidosCanjeados },
    data: { pedidosCanjeados: { increment: store.fidelizacionUmbral } },
  });
  if (resultado.count === 0) {
    return { ok: false, error: "Este cliente se actualizó justo ahora — volvé a intentar." };
  }
  revalidatePath("/admin/analytics");
  return { ok: true };
}
