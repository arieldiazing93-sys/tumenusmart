import { prisma } from "./prisma";
import { listarDias, claveDia } from "./rango-fecha";

export type RangoFecha = { gte: Date; lt: Date };

/**
 * Un pedido cuenta como REAL si el cliente lo envió por WhatsApp, o si el
 * local ya lo tocó (lo confirmó, lo preparó, lo entregó...). Con esto la
 * facturación no se infla con carritos abandonados, pero tampoco se pierde
 * un pedido legítimo cuyo registro de envío falló: apenas el encargado lo
 * mueve de "pendiente", vuelve a contar.
 */
const PEDIDO_REAL = {
  OR: [{ enviadoWhatsapp: true }, { estado: { not: "pendiente" } }],
};

export async function calcularEstadisticas(storeId: string, rango: RangoFecha) {
  const [store, pedidos, primerPedidoPorCliente] = await Promise.all([
    prisma.store.findUnique({ where: { id: storeId } }),
    prisma.order.findMany({
      where: { storeId, createdAt: rango, ...PEDIDO_REAL },
      include: { items: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.order.groupBy({
      by: ["clienteTelefono"],
      where: { storeId, ...PEDIDO_REAL },
      _min: { createdAt: true },
    }),
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
  };
}

export type FilaRanking = {
  nombre: string;
  unidades: number;
  facturacion: number;
  /** porcentaje que representa sobre las unidades vendidas del período */
  porcentaje: number;
};

export type RankingProductos = {
  masVendidos: FilaRanking[];
  /** productos activos del menú que no vendieron ni una unidad en el período */
  sinVentas: string[];
  unidadesTotales: number;
};

/**
 * Ranking de productos del período, ordenado por unidades vendidas.
 *
 * Se agrupa por el NOMBRE guardado en el ítem (no por el id del producto)
 * porque así entran también los combos "mitad y mitad", que no apuntan a un
 * único producto. El efecto secundario es que si a un producto le cambiaste
 * el nombre, las ventas viejas figuran con el nombre viejo — que en la
 * práctica es lo que uno quiere ver.
 */
export async function calcularRankingProductos(
  storeId: string,
  rango: RangoFecha,
  limite = 10
): Promise<RankingProductos> {
  const [items, productosActivos] = await Promise.all([
    prisma.orderItem.findMany({
      where: {
        storeId,
        order: { createdAt: rango, estado: { not: "cancelado" }, ...PEDIDO_REAL },
      },
      select: { nombreProducto: true, cantidad: true, precioUnitario: true },
    }),
    prisma.product.findMany({
      where: { storeId, disponible: true },
      select: { nombre: true },
    }),
  ]);

  const acumulado = new Map<string, { unidades: number; facturacion: number }>();
  for (const item of items) {
    const clave = item.nombreProducto;
    const actual = acumulado.get(clave) ?? { unidades: 0, facturacion: 0 };
    actual.unidades += item.cantidad;
    actual.facturacion += item.cantidad * Number(item.precioUnitario);
    acumulado.set(clave, actual);
  }

  const unidadesTotales = [...acumulado.values()].reduce((s, v) => s + v.unidades, 0);

  const ordenado: FilaRanking[] = [...acumulado.entries()]
    .map(([nombre, v]) => ({
      nombre,
      unidades: v.unidades,
      facturacion: v.facturacion,
      porcentaje: unidadesTotales > 0 ? (v.unidades / unidadesTotales) * 100 : 0,
    }))
    .sort((a, b) => b.unidades - a.unidades || b.facturacion - a.facturacion);

  const vendidos = new Set(acumulado.keys());
  const sinVentas = productosActivos
    .map((p) => p.nombre)
    .filter((nombre) => !vendidos.has(nombre))
    .sort((a, b) => a.localeCompare(b, "es"));

  return {
    masVendidos: ordenado.slice(0, limite),
    sinVentas,
    unidadesTotales,
  };
}

// Mismo período que calcularEstadisticas, pero mirando Reservation.fecha
// (el día de la mesa reservada) en vez de createdAt — así "Últimos 7 días"
// muestra cuántas reservas hay agendadas para esos días, que es lo que le
// interesa al encargado, no cuándo se cargaron.
export async function calcularEstadisticasReservas(storeId: string, rango: RangoFecha) {
  // Igual que el calendario: solo cuentan las reservas que el cliente
  // llegó a enviar por WhatsApp.
  const reservas = await prisma.reservation.findMany({
    where: { storeId, fecha: rango, enviadoWhatsapp: true },
    orderBy: { fecha: "asc" },
  });

  const total = reservas.length;
  const personasTotales = reservas.reduce((s, r) => s + r.personas, 0);

  const porEstado = {
    pendiente: reservas.filter((r) => r.estado === "pendiente").length,
    confirmada: reservas.filter((r) => r.estado === "confirmada").length,
    cancelada: reservas.filter((r) => r.estado === "cancelada").length,
  };

  const porTurno = {
    dia: reservas.filter((r) => r.turno === "dia").length,
    tarde: reservas.filter((r) => r.turno === "tarde").length,
    noche: reservas.filter((r) => r.turno === "noche").length,
  };

  const dias = listarDias(rango.gte, rango.lt);
  const totalesPorDia = new Map<string, number>();
  for (const d of dias) totalesPorDia.set(claveDia(d), 0);
  for (const r of reservas) {
    const clave = claveDia(new Date(r.fecha));
    totalesPorDia.set(clave, (totalesPorDia.get(clave) ?? 0) + 1);
  }

  return { total, personasTotales, porEstado, porTurno, dias, totalesPorDia };
}
