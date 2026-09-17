import type { PrismaLocal } from "@/lib/prisma-local";

/**
 * El turno de caja abierto del local, si hay uno.
 *
 * Es solo lectura (no Server Action): lo usan los `page.tsx` de venta,
 * apertura y cierre para decidir a dónde redirigir. Solo puede haber un
 * turno "abierto" por local a la vez.
 */
export async function turnoAbierto(db: PrismaLocal) {
  return db.turnoPos.findFirst({
    where: { estado: "abierto" },
    orderBy: { abiertoEn: "desc" },
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
