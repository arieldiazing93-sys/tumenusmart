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
 * Pedidos (delivery y retiro) cobrados durante este turno — el mismo cierre que las ventas de mostrador, no uno aparte. Un
 * pedido se ata al turno al COBRARSE: cuando se carga a mano (Pedidos → Nuevo pedido) o con "Cobrar" (ver cobrarPedido en
 * pedidos/actions.ts). Para el cierre la venta es de ese momento, no del paso de la entrega.
 */
export async function pedidosDelTurno(db: PrismaLocal, turnoId: string) {
  return db.order.findMany({
    where: { turnoPosId: turnoId },
    orderBy: { cobradoEn: "asc" },
    select: {
      id: true,
      numero: true,
      total: true,
      formaPagoPos: true,
      clienteNombre: true,
      estado: true,
      updatedAt: true,
      cobradoEn: true,
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
