import { prismaDelLocal } from "./prisma-local";
import type { RangoFecha } from "./estadisticas";

export type FilaRepartidorEnvio = {
  /** Null = la cuenta nunca tuvo un repartidor asignado. */
  repartidorId: string | null;
  repartidorNombre: string;
  cantidadPedidos: number;
};

export type FilaZonaEnvio = {
  /** Null = cuentas sin zona (el envío se coordinó directo) o de una zona que ya se borró. */
  zonaId: string | null;
  zonaNombre: string;
  cantidadPedidos: number;
  /** Suma de lo cobrado en esas cuentas (la venta entera: productos, descuento y envío). */
  totalFacturado: number;
  /** Suma de lo cobrado de envío — solo esa parte. */
  totalEnvio: number;
  envioPromedio: number;
  /** Quién hizo esos envíos, desglosado — ordenados de quien más hizo a quien menos. */
  repartidores: FilaRepartidorEnvio[];
};

export type ReporteEnvios = {
  zonas: FilaZonaEnvio[];
  totalGeneral: {
    cantidadPedidos: number;
    cantidadDelivery: number;
    totalFacturado: number;
    totalEnvio: number;
  };
};

/**
 * Las cuentas de Servicio delivery COBRADAS en el período, agrupadas por zona de envío — separado de Rentabilidad y Estadísticas a
 * propósito: esto es sobre CÓMO llega el pedido, no sobre qué se vendió.
 *
 * Una cuenta cuenta el día en que se cobró (es el día en que entró la plata). Una cuenta cancelada sin cobrar, o cuyo cobro se
 * canceló después, no cuenta: igual que en Estadísticas, donde esa venta tampoco suma. Lo facturado es el total de la venta
 * (`VentaPos.total`, con el envío adentro), así que coincide con lo que muestran el cierre de turno y Estadísticas.
 */
export async function calcularReporteEnvios(
  storeId: string,
  rango: RangoFecha
): Promise<ReporteEnvios> {
  const db = prismaDelLocal(storeId);
  const cuentas = await db.cuentaDelivery.findMany({
    where: { estado: "pagada", cerradaEn: { gte: rango.gte, lt: rango.lt } },
    select: {
      deliveryZoneId: true,
      zonaNombre: true,
      costoEnvio: true,
      repartidorId: true,
      repartidor: { select: { nombre: true } },
      ventaPosId: true,
    },
  });

  // Lo que se cobró de cada una: el total de su venta (si la venta se canceló, la cuenta ya no está "pagada" y no llega hasta acá).
  const idsDeVentas = cuentas.flatMap((c) => (c.ventaPosId ? [c.ventaPosId] : []));
  const ventas = idsDeVentas.length
    ? await db.ventaPos.findMany({ where: { id: { in: idsDeVentas }, cancelada: false }, select: { id: true, total: true } })
    : [];
  const totalDeVenta = new Map(ventas.map((v) => [v.id, Number(v.total)]));

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
  // Sin zona propia: el negocio que coordina el envío directo ("A coordinar") no tiene una zona real a la que atribuirle la cuenta.
  const SIN_ZONA = "__sin_zona__";
  const A_COORDINAR = "A coordinar";

  for (const c of cuentas) {
    const facturado = c.ventaPosId ? totalDeVenta.get(c.ventaPosId) : undefined;
    if (facturado === undefined) continue;

    // La zona por su id; si se borró (el id quedó vacío), por el nombre con que se abrió la cuenta.
    const nombreGuardado = c.zonaNombre && c.zonaNombre !== A_COORDINAR ? c.zonaNombre : null;
    const clave = c.deliveryZoneId ?? (nombreGuardado ? `nombre:${nombreGuardado}` : SIN_ZONA);
    const actual = zonasMap.get(clave) ?? {
      zonaId: c.deliveryZoneId,
      zonaNombre: nombreGuardado ?? "Sin zona / a coordinar",
      cantidadPedidos: 0,
      totalFacturado: 0,
      totalEnvio: 0,
      repartidores: new Map(),
    };
    actual.cantidadPedidos += 1;
    actual.totalFacturado += facturado;
    actual.totalEnvio += Number(c.costoEnvio);

    const claveRepartidor = c.repartidorId ?? SIN_REPARTIDOR;
    const repartidor = actual.repartidores.get(claveRepartidor) ?? {
      repartidorId: c.repartidorId,
      repartidorNombre: c.repartidor?.nombre ?? "Sin repartidor asignado",
      cantidadPedidos: 0,
    };
    repartidor.cantidadPedidos += 1;
    actual.repartidores.set(claveRepartidor, repartidor);

    zonasMap.set(clave, actual);
  }

  // La zona que más pedidos mueve primero: acá interesa dónde conviene reforzar reparto, no un orden alfabético. Dentro de cada
  // zona, el repartidor que más hizo primero, con el mismo criterio.
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
  return {
    zonas,
    totalGeneral: {
      cantidadPedidos: cantidadDelivery,
      cantidadDelivery,
      totalFacturado: zonas.reduce((s, z) => s + z.totalFacturado, 0),
      totalEnvio: zonas.reduce((s, z) => s + z.totalEnvio, 0),
    },
  };
}
