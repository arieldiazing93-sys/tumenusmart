import { prisma } from "./prisma";

/**
 * Qué pasa con un local SUSPENDIDO A MANO (Super → Suspender): conserva todo y puede seguir viendo sus reportes, cerrando el turno de
 * caja y descargando sus datos, pero ya no puede REGISTRAR VENTAS (mostrador, comedor, delivery, mozos, pedidos del menú, facturas
 * nuevas). Un local VENCIDO por fecha NO entra acá: sigue vendiendo mientras se negocia con el dueño (lo único que se apaga es el
 * menú público, ver `estaSuspendido` en local-por-slug.ts). Suspender es la decisión de cortar de verdad.
 */

export const MENSAJE_VENTAS_SUSPENDIDAS =
  "La cuenta de este local está suspendida y no se pueden registrar ventas. Podés seguir viendo tus reportes y cerrando el turno de caja. Comunicate con TuMenuSmart para reactivarla.";

/** ¿Este estado del local impide registrar ventas? Solo «suspendido» (a mano): «vencido» no. */
export function ventasBloqueadas(estado: string | null | undefined): boolean {
  return estado === "suspendido";
}

/** Lo que devuelve una acción de venta cuando la cuenta está suspendida (cabe en el resultado de cualquiera de ellas). */
export const RESPUESTA_VENTAS_SUSPENDIDAS = { ok: false as const, error: MENSAJE_VENTAS_SUSPENDIDAS };

/**
 * Se llama al empezar toda acción que registra una venta o emite una factura: devuelve el rechazo listo para devolver, o null si el
 * local puede vender. Una consulta por la clave del local.
 */
export async function bloqueoPorSuspension(storeId: string): Promise<typeof RESPUESTA_VENTAS_SUSPENDIDAS | null> {
  const local = await prisma.store.findUnique({ where: { id: storeId }, select: { estado: true } });
  return ventasBloqueadas(local?.estado) ? RESPUESTA_VENTAS_SUSPENDIDAS : null;
}
