import { prismaDelLocal } from "./prisma-local";
import { PEDIDO_REAL, type RangoFecha } from "./estadisticas";
import { agruparPorCliente, type ClienteAgrupado } from "./agrupar-clientes";

export type ClienteRankeado = ClienteAgrupado;

/**
 * Todos los clientes que pidieron en el rango, ordenados por cantidad de
 * pedidos (empate: por gasto). Devuelve la lista completa, sin cortar en el
 * top 100 — la distribución de frecuencia necesita ver a todos, y quien la
 * llame decide cuántos mostrar en la tabla.
 */
export async function calcularClientesDelRango(
  storeId: string,
  rango: RangoFecha
): Promise<ClienteRankeado[]> {
  const pedidos = await prismaDelLocal(storeId).order.findMany({
    where: { createdAt: rango, ...PEDIDO_REAL },
    select: { clienteTelefono: true, clienteNombre: true, createdAt: true, total: true },
  });

  const clientes = agruparPorCliente(
    pedidos.map((p) => ({
      clienteTelefono: p.clienteTelefono,
      clienteNombre: p.clienteNombre,
      createdAt: p.createdAt,
      total: Number(p.total),
    }))
  );

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
