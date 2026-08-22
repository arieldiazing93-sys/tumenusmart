import { prisma } from "./prisma";
import { listarDias, claveDia } from "./rango-fecha";

export type RangoFecha = { gte: Date; lt: Date };

export async function calcularEstadisticas(rango: RangoFecha) {
  const [store, pedidos, primerPedidoPorCliente] = await Promise.all([
    prisma.store.findFirst(),
    prisma.order.findMany({
      where: { createdAt: rango },
      include: { items: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.order.groupBy({ by: ["clienteTelefono"], _min: { createdAt: true } }),
  ]);

  const validos = pedidos.filter((p) => p.estado !== "cancelado");
  const cancelados = pedidos.filter((p) => p.estado === "cancelado");

  const ingresos = validos.reduce((s, p) => s + Number(p.total), 0);
  const pedidosTotales = pedidos.length;
  const pedidosValidos = validos.length;
  const ticketPromedio = pedidosValidos > 0 ? ingresos / pedidosValidos : 0;

  const unidadesVendidas = validos.reduce(
    (s, p) => s + p.items.reduce((si, it) => si + it.cantidad, 0),
    0
  );
  const productosPorPedido = pedidosValidos > 0 ? unidadesVendidas / pedidosValidos : 0;

  const clientesUnicos = new Set(pedidos.map((p) => p.clienteTelefono)).size;

  const clientesNuevos = primerPedidoPorCliente.filter((c) => {
    const primera = c._min.createdAt;
    return primera && primera >= rango.gte && primera < rango.lt;
  }).length;

  const dias = listarDias(rango.gte, rango.lt);
  const totalesPorDia = new Map<string, number>();
  for (const d of dias) totalesPorDia.set(claveDia(d), 0);
  for (const p of validos) {
    const clave = claveDia(new Date(p.createdAt));
    totalesPorDia.set(clave, (totalesPorDia.get(clave) ?? 0) + Number(p.total));
  }

  const puntosCalor = pedidos
    .filter((p) => p.tipoEntrega === "delivery" && p.clienteLat != null && p.clienteLng != null)
    .map((p) => ({ lat: p.clienteLat as number, lng: p.clienteLng as number }));

  return {
    store,
    pedidosTotales,
    pedidosValidos,
    cancelados: cancelados.length,
    ingresos,
    ticketPromedio,
    unidadesVendidas,
    productosPorPedido,
    clientesUnicos,
    clientesNuevos,
    dias,
    totalesPorDia,
    puntosCalor,
  };
}
