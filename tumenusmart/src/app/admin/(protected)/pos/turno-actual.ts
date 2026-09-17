import type { PrismaLocal } from "@/lib/prisma-local";

/**
 * El turno de caja abierto de ESA estación, si hay uno.
 *
 * Es solo lectura (no Server Action): lo usan los `page.tsx` de venta,
 * apertura y cierre para decidir a dónde redirigir. Solo puede haber un
 * turno "abierto" por estación a la vez (ver el índice único parcial en la
 * migración SQL) — dos estaciones del mismo local pueden tener cada una el
 * suyo en simultáneo, así que ya no alcanza con "el" turno del local: hay
 * que decir de cuál estación (ver `estacionActual` en
 * `src/lib/estacion-actual.ts`).
 */
export async function turnoAbierto(db: PrismaLocal, estacionId: string) {
  return db.turnoPos.findFirst({
    where: { estado: "abierto", estacionId },
  });
}

/**
 * Pedidos de mostrador (retiro/mesa) cobrados durante este turno — el mismo
 * cierre que las ventas de mostrador, no uno aparte. Se atan acá al marcarse
 * "entregado" (ver cambiarEstadoPedido en pedidos/actions.ts).
 */
export async function pedidosDelTurno(db: PrismaLocal, turnoId: string) {
  return db.order.findMany({
    where: { turnoPosId: turnoId },
    orderBy: { updatedAt: "asc" },
    select: {
      id: true,
      numero: true,
      total: true,
      formaPagoPos: true,
      clienteNombre: true,
      estado: true,
      updatedAt: true,
    },
  });
}
