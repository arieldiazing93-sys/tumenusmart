"use server";

import { exigirPermiso } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { normalizarFormaPagoPos } from "@/lib/turno-pos";
import { estacionActual } from "@/lib/estacion-actual";
import { turnoAbierto } from "../pos/turno-actual";

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
  estado: string,
  formaPagoPos?: string
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

  // Retiro y mesa se cobran en el mostrador, con la misma persona y la misma
  // caja que el Punto de Venta — así que van al mismo cierre, no a uno
  // aparte. El delivery queda afuera: ese cierre sigue siendo la Rendición
  // del repartidor (ahí sí conviene un cierre separado, porque es plata que
  // anduvo circulando fuera del local).
  let datosExtra: { formaPagoPos: string; turnoPosId: string } | Record<string, never> = {};
  if (estado === "entregado") {
    const pedido = await prisma.order.findUnique({
      where: { id: orderId },
      select: { tipoEntrega: true, estado: true },
    });
    if (pedido && pedido.tipoEntrega !== "delivery" && pedido.estado !== "entregado") {
      // Se ata al turno de la MISMA computadora desde la que se marca
      // entregado — misma cookie de estación que usa el Punto de Venta (ver
      // src/lib/estacion-actual.ts). Sin estación vinculada, o sin turno
      // abierto en esa estación, no hay a qué cierre atarlo: se marca
      // entregado igual, sin pedir forma de pago — no romper el flujo de
      // todos los días para quien mira Pedidos desde un dispositivo que no
      // es una caja.
      const estacion = await estacionActual(prisma);
      const turno = estacion ? await turnoAbierto(prisma, estacion.id) : null;
      if (turno) {
        if (!formaPagoPos) {
          return { ok: false, error: "Declará con qué se cobró antes de marcarlo entregado." };
        }
        datosExtra = { formaPagoPos: normalizarFormaPagoPos(formaPagoPos), turnoPosId: turno.id };
      }
    }
  }

  await prisma.order.update({ where: { id: orderId }, data: { estado, ...datosExtra } });
  revalidatePath("/admin/pedidos");
  revalidatePath(`/admin/pedidos/${orderId}`);
  if ("turnoPosId" in datosExtra) {
    revalidatePath("/admin/pos");
    revalidatePath("/admin/pos/turnos");
  }
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
