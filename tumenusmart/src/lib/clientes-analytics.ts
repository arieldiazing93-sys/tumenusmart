import { prismaDelLocal } from "./prisma-local";
import { PEDIDO_REAL, type RangoFecha } from "./estadisticas";
import { agruparPorCliente, type ClienteAgrupado } from "./agrupar-clientes";

export type ClienteRankeado = ClienteAgrupado;

/**
 * Todos los clientes que pidieron en el rango, ordenados por cantidad de
 * pedidos (empate: por gasto). Devuelve la lista completa, sin cortar en el
 * top 100 — la distribución de frecuencia necesita ver a todos, y quien la
 * llame decide cuántos mostrar en la tabla.
 *
 * Combina las dos fuentes de venta, mismo criterio que `calcularEstadisticas`
 * y `fidelidad.ts`: pedidos online (`Order`) y ventas de mostrador
 * (`VentaPos`) — esta última incluye tanto lo que se cobra directo en el POS
 * como una cita de Reserva de turnos ya cobrada (que "entra en caja" como una
 * VentaPos con `Cita.ventaPosId`). Antes solo miraba `Order`, así que un
 * cliente que solo viene por turno (corte, sesión...) nunca aparecía acá.
 */
export async function calcularClientesDelRango(
  storeId: string,
  rango: RangoFecha
): Promise<ClienteRankeado[]> {
  // Mismo criterio que calcularEstadisticas/calcularRankingProductos: un
  // pedido cancelado no es una venta real, no puede sumar ni a la
  // frecuencia de compra ni al gasto total de un cliente.
  const [pedidos, ventasPos] = await Promise.all([
    prismaDelLocal(storeId).order.findMany({
      where: { createdAt: rango, estado: { not: "cancelado" }, ...PEDIDO_REAL },
      select: { clienteTelefono: true, clienteNombre: true, createdAt: true, total: true },
    }),
    // El teléfono es opcional en una VentaPos (mucha venta de mostrador es un
    // cliente de paso sin datos cargados) — sin teléfono no hay a quién
    // sumarle el pedido, queda afuera igual que en fidelidad.ts.
    prismaDelLocal(storeId).ventaPos.findMany({
      where: { creadoEn: rango, cancelada: false, clienteTelefono: { not: null } },
      select: { clienteTelefono: true, clienteNombre: true, creadoEn: true, total: true },
    }),
  ]);

  const clientes = agruparPorCliente([
    ...pedidos.map((p) => ({
      clienteTelefono: p.clienteTelefono,
      clienteNombre: p.clienteNombre,
      createdAt: p.createdAt,
      total: Number(p.total),
    })),
    ...ventasPos.map((v) => ({
      clienteTelefono: v.clienteTelefono as string,
      clienteNombre: v.clienteNombre?.trim() || "Cliente de mostrador",
      createdAt: v.creadoEn,
      total: Number(v.total),
    })),
  ]);

  return clientes.sort((a, b) => b.pedidos - a.pedidos || b.gastado - a.gastado);
}

export type DistribucionFrecuencia = { unaVez: number; dosATres: number; cuatroOMas: number };

/**
 * Cuántos clientes pidieron 1 vez, 2-3 veces, o 4 o más en el rango — para
 * ver de un vistazo qué tan fiel es la base de clientes, sin tener que leer
 * la tabla entera.
 */
export function calcularDistribucionFrecuencia(
  clientes: ClienteRankeado[]
): DistribucionFrecuencia {
  const dist: DistribucionFrecuencia = { unaVez: 0, dosATres: 0, cuatroOMas: 0 };
  for (const c of clientes) {
    if (c.pedidos === 1) dist.unaVez += 1;
    else if (c.pedidos <= 3) dist.dosATres += 1;
    else dist.cuatroOMas += 1;
  }
  return dist;
}
