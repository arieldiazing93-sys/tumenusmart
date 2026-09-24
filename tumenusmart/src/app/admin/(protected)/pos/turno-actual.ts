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

/**
 * Entregas de delivery "en la calle" — despachadas o entregadas pero
 * todavía sin rendir (`rendicionId` vacío) — en TODO el local, sin importar
 * la estación.
 *
 * Se usa para frenar el cierre de un turno: si un repartidor todavía tiene
 * plata sin devolver, cerrar caja daría un corte general incompleto (ver
 * cerrarTurno en pos/actions.ts). Es a propósito store-wide y no por
 * estación — el reparto no es exclusivo de una computadora, y lo que importa
 * acá es que no quede plata circulando sin cerrar, sin importar desde dónde
 * se despachó.
 */
export async function entregasSinRendir(db: PrismaLocal) {
  return db.order.findMany({
    where: {
      tipoEntrega: "delivery",
      estado: { in: ["en_despacho", "entregado"] },
      rendicionId: null,
    },
    select: {
      id: true,
      numero: true,
      estado: true,
      repartidor: { select: { nombre: true } },
    },
  });
}

/**
 * Lo que entró (ingresos) y salió (retiros) de la caja en efectivo durante el
 * turno, aparte de las ventas — ver MovimientoCaja. El `neto` (ingresos menos
 * retiros) es lo que se le suma al efectivo que tendría que haber al cerrar.
 */
export async function netoMovimientosCaja(db: PrismaLocal, turnoId: string) {
  const filas = await db.movimientoCaja.groupBy({
    by: ["tipo"],
    where: { turnoPosId: turnoId },
    _sum: { monto: true },
  });
  let ingresos = 0;
  let retiros = 0;
  for (const f of filas) {
    const monto = Number(f._sum.monto ?? 0);
    if (f.tipo === "ingreso") ingresos += monto;
    else if (f.tipo === "retiro") retiros += monto;
  }
  return { ingresos, retiros, neto: ingresos - retiros };
}
