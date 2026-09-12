import { prismaDelLocal } from "./prisma-local";
import { PEDIDO_REAL, type RangoFecha } from "./estadisticas";

export type FilaRepartidorEnvio = {
  /** Null = el pedido nunca tuvo un repartidor asignado (quedó pendiente,
   * se entregó sin pasar por "en despacho", etc.). */
  repartidorId: string | null;
  repartidorNombre: string;
  cantidadPedidos: number;
};

export type FilaZonaEnvio = {
  /** Null = pedidos delivery que no matchearon ninguna zona activa (el
   * negocio usa "coordinar", o el cliente quedó fuera de todas las zonas). */
  zonaId: string | null;
  zonaNombre: string;
  cantidadPedidos: number;
  /** Suma de Order.total — lo que esos pedidos facturaron en total. */
  totalFacturado: number;
  /** Suma de Order.costoEnvio — solo la parte de envío. */
  totalEnvio: number;
  envioPromedio: number;
  /** Quién hizo esos envíos, desglosado — ordenados de quien más hizo a
   * quien menos. */
  repartidores: FilaRepartidorEnvio[];
};

export type ReporteEnvios = {
  zonas: FilaZonaEnvio[];
  retiro: { cantidadPedidos: number; totalFacturado: number };
  totalGeneral: {
    cantidadPedidos: number;
    cantidadDelivery: number;
    cantidadRetiro: number;
    totalFacturado: number;
    totalEnvio: number;
  };
};

/**
 * Pedidos del período, agrupados por zona de envío — separado de
 * Rentabilidad y Estadísticas a propósito: esto es sobre CÓMO llega el
 * pedido, no sobre qué se vendió.
 *
 * Usa el mismo criterio de "pedido real" que el resto (PEDIDO_REAL, sin
 * cancelados), para que la cantidad de pedidos coincida con lo que muestran
 * las otras pantallas.
 */
export async function calcularReporteEnvios(
  storeId: string,
  rango: RangoFecha
): Promise<ReporteEnvios> {
  const db = prismaDelLocal(storeId);
  const pedidos = await db.order.findMany({
    where: {
      createdAt: rango,
      estado: { not: "cancelado" },
      // Este reporte es sobre zonas y repartidores: un pedido de mesa no
      // tiene ninguno de los dos, así que ni suma como delivery ni como
      // retiro — queda afuera del todo (cuenta en Estadísticas y
      // Rentabilidad igual, ahí sí sin importar el tipo de entrega).
      tipoEntrega: { not: "mesa" },
      ...PEDIDO_REAL,
    },
    select: {
      tipoEntrega: true,
      deliveryZoneId: true,
      deliveryZone: { select: { nombre: true } },
      costoEnvio: true,
      total: true,
      repartidorId: true,
      repartidor: { select: { nombre: true } },
    },
  });

  type Acumulado = {
    zonaId: string | null;
    zonaNombre: string;
    cantidadPedidos: number;
    totalFacturado: number;
    totalEnvio: number;
    repartidores: Map<string, { repartidorId: string | null; repartidorNombre: string; cantidadPedidos: number }>;
  };
  const zonasMap = new Map<string, Acumulado>();
  const SIN_REPARTIDOR = "__sin_repartidor__";
  // Sin zona propia: agrupa tanto al negocio que coordina el envío directo
  // como al cliente que quedó fuera de todos los radios cargados — en los
  // dos casos, no hay una zona real a la que atribuirle el pedido.
  const SIN_ZONA = "__sin_zona__";

  let retiroCantidad = 0;
  let retiroTotal = 0;

  for (const p of pedidos) {
    if (p.tipoEntrega !== "delivery") {
      retiroCantidad += 1;
      retiroTotal += Number(p.total);
      continue;
    }

    const clave = p.deliveryZoneId ?? SIN_ZONA;
    const actual = zonasMap.get(clave) ?? {
      zonaId: p.deliveryZoneId,
      zonaNombre: p.deliveryZone?.nombre ?? "Sin zona / a coordinar",
      cantidadPedidos: 0,
      totalFacturado: 0,
      totalEnvio: 0,
      repartidores: new Map(),
    };
    actual.cantidadPedidos += 1;
    actual.totalFacturado += Number(p.total);
    actual.totalEnvio += Number(p.costoEnvio);

    const claveRepartidor = p.repartidorId ?? SIN_REPARTIDOR;
    const repartidor = actual.repartidores.get(claveRepartidor) ?? {
      repartidorId: p.repartidorId,
      repartidorNombre: p.repartidor?.nombre ?? "Sin repartidor asignado",
      cantidadPedidos: 0,
    };
    repartidor.cantidadPedidos += 1;
    actual.repartidores.set(claveRepartidor, repartidor);

    zonasMap.set(clave, actual);
  }

  // La zona que más pedidos mueve primero: acá interesa dónde conviene
  // reforzar reparto, no un orden alfabético. Dentro de cada zona, el
  // repartidor que más hizo primero, con el mismo criterio.
  const zonas: FilaZonaEnvio[] = [...zonasMap.values()]
    .map((z) => ({
      zonaId: z.zonaId,
      zonaNombre: z.zonaNombre,
      cantidadPedidos: z.cantidadPedidos,
      totalFacturado: z.totalFacturado,
      totalEnvio: z.totalEnvio,
      envioPromedio: z.cantidadPedidos > 0 ? z.totalEnvio / z.cantidadPedidos : 0,
      repartidores: [...z.repartidores.values()].sort((a, b) => b.cantidadPedidos - a.cantidadPedidos),
    }))
    .sort((a, b) => b.cantidadPedidos - a.cantidadPedidos);

  const cantidadDelivery = zonas.reduce((s, z) => s + z.cantidadPedidos, 0);
  const totalEnvio = zonas.reduce((s, z) => s + z.totalEnvio, 0);
  const totalFacturadoDelivery = zonas.reduce((s, z) => s + z.totalFacturado, 0);

  return {
    zonas,
    retiro: { cantidadPedidos: retiroCantidad, totalFacturado: retiroTotal },
    totalGeneral: {
      cantidadPedidos: cantidadDelivery + retiroCantidad,
      cantidadDelivery,
      cantidadRetiro: retiroCantidad,
      totalFacturado: totalFacturadoDelivery + retiroTotal,
      totalEnvio,
    },
  };
}
