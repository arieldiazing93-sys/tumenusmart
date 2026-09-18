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
export const PEDIDO_REAL = {
  OR: [{ enviadoWhatsapp: true }, { estado: { not: "pendiente" } }],
};

/**
 * Ventas del período, combinando las dos fuentes que existen hoy: pedidos
 * online (`Order`, cualquier tipo de entrega) y ventas de mostrador
 * (`VentaPos`, cobradas directo en el POS). Antes esta función solo miraba
 * `Order` — un local que factura una parte relevante por mostrador veía
 * "Ingresos"/"Pedidos"/ranking de productos sistemáticamente por debajo de
 * lo real. `reporte-general-pos.ts` y `fidelidad.ts` ya combinaban las dos
 * fuentes para sus propios cálculos; acá se sigue el mismo criterio.
 */
export async function calcularEstadisticas(storeId: string, rango: RangoFecha) {
  const [store, pedidos, ventasPos, primerPedidoPorCliente, primeraVentaPorCliente] = await Promise.all([
    prisma.store.findUnique({ where: { id: storeId } }),
    prisma.order.findMany({
      where: { storeId, createdAt: rango, ...PEDIDO_REAL },
      include: { items: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.ventaPos.findMany({
      where: { storeId, creadoEn: rango },
      include: { items: true },
      orderBy: { creadoEn: "asc" },
    }),
    prisma.order.groupBy({
      by: ["clienteTelefono"],
      where: { storeId, ...PEDIDO_REAL },
      _min: { createdAt: true },
    }),
    // Mucha venta de mostrador es un cliente de paso sin teléfono cargado
    // (ver comentario en VentaPos.clienteTelefono) — esas quedan afuera de
    // este agrupado, no pueden sumar a una fidelización/novedad que
    // depende del teléfono.
    prisma.ventaPos.groupBy({
      by: ["clienteTelefono"],
      where: { storeId, clienteTelefono: { not: null } },
      _min: { creadoEn: true },
    }),
  ]);

  const validosPedidos = pedidos.filter((p) => p.estado !== "cancelado");
  const canceladosPedidos = pedidos.filter((p) => p.estado === "cancelado");
  const validasVentas = ventasPos.filter((v) => !v.cancelada);
  const canceladasVentas = ventasPos.filter((v) => v.cancelada);

  const ingresos =
    validosPedidos.reduce((s, p) => s + Number(p.total), 0) +
    validasVentas.reduce((s, v) => s + Number(v.total), 0);
  const ventasTotales = pedidos.length + ventasPos.length;
  const ventasValidas = validosPedidos.length + validasVentas.length;
  const ticketPromedio = ventasValidas > 0 ? ingresos / ventasValidas : 0;

  const unidadesVendidas =
    validosPedidos.reduce((s, p) => s + p.items.reduce((si, it) => si + it.cantidad, 0), 0) +
    validasVentas.reduce((s, v) => s + v.items.reduce((si, it) => si + it.cantidad, 0), 0);
  const productosPorPedido = ventasValidas > 0 ? unidadesVendidas / ventasValidas : 0;

  // Clientes únicos por teléfono, combinando las dos fuentes — el mismo
  // cliente que compró online y en el mostrador cuenta una sola vez.
  const telefonos = new Set<string>();
  for (const p of pedidos) if (p.clienteTelefono) telefonos.add(p.clienteTelefono);
  for (const v of ventasPos) if (v.clienteTelefono) telefonos.add(v.clienteTelefono);
  const clientesUnicos = telefonos.size;

  // "Nuevo" = su primera compra de SIEMPRE (por cualquiera de los dos
  // canales) cae en este período — si ya había comprado antes por el otro
  // canal, no es nuevo aunque sea su primer pedido online.
  const primeraCompraPorTelefono = new Map<string, Date>();
  for (const c of primerPedidoPorCliente) {
    if (!c._min.createdAt) continue;
    const actual = primeraCompraPorTelefono.get(c.clienteTelefono);
    if (!actual || c._min.createdAt < actual) primeraCompraPorTelefono.set(c.clienteTelefono, c._min.createdAt);
  }
  for (const c of primeraVentaPorCliente) {
    if (!c._min.creadoEn || !c.clienteTelefono) continue;
    const actual = primeraCompraPorTelefono.get(c.clienteTelefono);
    if (!actual || c._min.creadoEn < actual) primeraCompraPorTelefono.set(c.clienteTelefono, c._min.creadoEn);
  }
  const clientesNuevos = [...primeraCompraPorTelefono.values()].filter(
    (primera) => primera >= rango.gte && primera < rango.lt
  ).length;

  const dias = listarDias(rango.gte, rango.lt);
  const totalesPorDia = new Map<string, number>();
  for (const d of dias) totalesPorDia.set(claveDia(d), 0);
  for (const p of validosPedidos) {
    const clave = claveDia(new Date(p.createdAt));
    totalesPorDia.set(clave, (totalesPorDia.get(clave) ?? 0) + Number(p.total));
  }
  for (const v of validasVentas) {
    const clave = claveDia(new Date(v.creadoEn));
    totalesPorDia.set(clave, (totalesPorDia.get(clave) ?? 0) + Number(v.total));
  }

  // Cuánto entró por cada vía — delivery, retiro, comer en el local. Se
  // arma acá y no en un reporte aparte porque ya se tiene todo en memoria:
  // no hace falta una segunda consulta a la base para esto.
  const porTipoEntrega = {
    delivery: { cantidad: 0, ingresos: 0 },
    retiro: { cantidad: 0, ingresos: 0 },
    mesa: { cantidad: 0, ingresos: 0 },
  };
  for (const p of validosPedidos) {
    const grupo =
      p.tipoEntrega === "delivery" || p.tipoEntrega === "mesa" ? p.tipoEntrega : "retiro";
    porTipoEntrega[grupo].cantidad += 1;
    porTipoEntrega[grupo].ingresos += Number(p.total);
  }
  // El POS no tiene delivery — "local" (se consume ahí) equivale a "mesa" y
  // "llevar" (para llevar) equivale a "retiro", mismo par de categorías que
  // ya usa el propio ticket del POS para diferenciar el comprobante.
  for (const v of validasVentas) {
    const grupo = v.tipoEntrega === "local" ? "mesa" : "retiro";
    porTipoEntrega[grupo].cantidad += 1;
    porTipoEntrega[grupo].ingresos += Number(v.total);
  }

  return {
    store,
    ventasTotales,
    ventasValidas,
    cancelados: canceladosPedidos.length + canceladasVentas.length,
    ingresos,
    ticketPromedio,
    unidadesVendidas,
    productosPorPedido,
    clientesUnicos,
    clientesNuevos,
    dias,
    totalesPorDia,
    porTipoEntrega,
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
  const [items, itemsPos, productosActivos] = await Promise.all([
    prisma.orderItem.findMany({
      where: {
        storeId,
        order: { createdAt: rango, estado: { not: "cancelado" }, ...PEDIDO_REAL },
      },
      select: { nombreProducto: true, cantidad: true, precioUnitario: true },
    }),
    // Un producto que solo se vende por mostrador (POS) no puede figurar
    // como "sin ventas" solo porque nadie lo pidió online.
    prisma.ventaPosItem.findMany({
      where: { storeId, ventaPos: { creadoEn: rango, cancelada: false } },
      select: { nombreProducto: true, cantidad: true, precioUnitario: true },
    }),
    prisma.product.findMany({
      where: { storeId, disponible: true },
      select: { nombre: true },
    }),
  ]);

  const acumulado = new Map<string, { unidades: number; facturacion: number }>();
  for (const item of [...items, ...itemsPos]) {
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
