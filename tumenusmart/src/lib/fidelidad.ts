import { prisma } from "./prisma";
import { prismaDelLocal } from "./prisma-local";

export type ProgresoFidelidad = {
  telefono: string;
  entregados: number;
  canjeados: number;
  progreso: number;
  listo: boolean;
};

function armarProgreso(
  telefono: string,
  entregados: number,
  canjeados: number,
  umbral: number
): ProgresoFidelidad {
  // Nunca negativo: un pedido "entregado" se puede volver a cambiar de
  // estado (corrección de un error de carga), y si eso pasa DESPUÉS de un
  // canje ya entregado, entregados - canjeados da negativo. Mostrar "-2/10"
  // no ayuda a nadie — se lee como progreso perdido, no como lo que es.
  const progreso = Math.max(0, entregados - canjeados);
  return { telefono, entregados, canjeados, progreso, listo: progreso >= umbral };
}

/**
 * Progreso de fidelización de todos los clientes del local, para la tabla
 * de Analytics.
 *
 * A propósito NO usa `agruparPorCliente()`: esa función está acotada a un
 * rango de fechas que elige quien la llama, pensada para analytics/ideas.
 * Acá el conteo es de siempre (nunca se acota a un rango) y solo cuenta
 * pedidos ya entregados — mezclar ambas cosas forzaría a los demás
 * llamadores de `agrupar-clientes.ts` a lidiar con campos que no usan.
 */
export async function calcularProgresoFidelidad(
  storeId: string,
  umbral: number
): Promise<Map<string, ProgresoFidelidad>> {
  const db = prismaDelLocal(storeId);
  const [entregas, clientes] = await Promise.all([
    db.order.groupBy({
      by: ["clienteTelefono"],
      where: { estado: "entregado" },
      _count: { _all: true },
    }),
    db.customer.findMany({ select: { telefono: true, pedidosCanjeados: true } }),
  ]);

  const canjeadosPorTelefono = new Map(clientes.map((c) => [c.telefono, c.pedidosCanjeados]));
  const mapa = new Map<string, ProgresoFidelidad>();
  for (const e of entregas) {
    const canjeados = canjeadosPorTelefono.get(e.clienteTelefono) ?? 0;
    mapa.set(
      e.clienteTelefono,
      armarProgreso(e.clienteTelefono, e._count._all, canjeados, umbral)
    );
  }
  return mapa;
}

/** Progreso de fidelización de un solo cliente, para su pantalla pública de seguimiento. */
export async function progresoDeCliente(
  storeId: string,
  telefono: string,
  umbral: number
): Promise<ProgresoFidelidad> {
  const db = prismaDelLocal(storeId);
  const [entregados, customer] = await Promise.all([
    db.order.count({ where: { clienteTelefono: telefono, estado: "entregado" } }),
    // Plain `prisma`, no `prismaDelLocal`, acá: la clave compuesta
    // storeId_telefono ya fija el local sola, igual que en el upsert del
    // checkout — no hace falta la capa extra para esto.
    prisma.customer.findUnique({
      where: { storeId_telefono: { storeId, telefono } },
      select: { pedidosCanjeados: true },
    }),
  ]);
  return armarProgreso(telefono, entregados, customer?.pedidosCanjeados ?? 0, umbral);
}
