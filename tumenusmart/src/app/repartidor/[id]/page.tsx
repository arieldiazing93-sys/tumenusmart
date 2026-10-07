import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { descuentoDeCuenta } from "@/lib/comedor";
import { totalesDeDelivery } from "@/lib/delivery";
import { calcularRangoFecha } from "@/lib/rango-fecha";
import { detallePagos } from "@/lib/pago-venta";
import { etiquetaFormaPagoPos } from "@/lib/turno-pos";
import { enlaceDeMapa, extraerUbicacion, primerEnlace, textoSinEnlaces } from "@/lib/ubicacion-mapa";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import { PantallaRepartidor, type FilaHistorial, type TarjetaRepartidor } from "./PantallaRepartidor";

export const dynamic = "force-dynamic";

/** Cada cuántos segundos la pantalla del repartidor vuelve a consultar sola (un minuto). */
const SEGUNDOS_ACTUALIZAR = 60;
/** Un pedido recién asignado se marca como "Nuevo" durante estos minutos. */
const MINUTOS_NUEVO = 3;
/** Una cuenta que la caja ya cerró sigue entre los pedidos de la ruta (con sus datos) durante estas horas, o hasta que se dé por entregada. */
const HORAS_EN_LA_CALLE = 12;
/** Cuántos pedidos como máximo trae el historial de una consulta (un tramo muy largo se acota). */
const MAXIMO_HISTORIAL = 400;

function hora(d: Date): string {
  return d.toLocaleTimeString("es-PY", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: ZONA_NEGOCIO });
}

function dia(d: Date): string {
  return d.toLocaleDateString("es-PY", { day: "2-digit", month: "2-digit", timeZone: ZONA_NEGOCIO });
}

/**
 * Con qué se pagó una venta, en números comunes (los montos de la base vienen como Decimal): sus pagos, o la forma única por el total
 * si la venta no tiene el detalle.
 */
function pagosDeVenta(v: {
  formaPago: string;
  total: { toString(): string };
  pagos: { forma: string; monto: { toString(): string } }[];
}): { forma: string; monto: number }[] {
  if (v.pagos.length === 0) return [{ forma: v.formaPago, monto: Number(v.total.toString()) }];
  return v.pagos.map((p) => ({ forma: p.forma, monto: Number(p.monto.toString()) }));
}

/** La ubicación del cliente: el punto marcado o pegado (coordenadas) o, si solo hay un enlace corto de Google Maps, ese enlace tal cual. */
function enlaceDeUbicacion(c: { clienteLat: number | null; clienteLng: number | null; direccion: string | null }): string | null {
  const coordenadas = c.clienteLat != null && c.clienteLng != null ? { lat: c.clienteLat, lng: c.clienteLng } : extraerUbicacion(c.direccion);
  return coordenadas ? enlaceDeMapa(coordenadas) : primerEnlace(c.direccion);
}

/**
 * La ruta de un repartidor. Es una página pública que se abre con el enlace del repartidor (su id hace de llave): solo muestra
 * cuentas de SU local y asignadas a él, y no cambia ningún dato (lo único que hace el repartidor, "Entregado", solo minimiza el
 * pedido en su propia pantalla).
 *
 *  - Pedidos de la ruta: los que la caja le asignó y siguen abiertos, y los que la caja ya cerró hace poco (no desaparecen al
 *    cobrarse: él todavía puede estar en la calle y necesita el teléfono y el mapa).
 *  - Historial: las cuentas que la caja cerró, en el tramo de fechas que se elija (hoy por defecto), con la forma de pago con la que
 *    se cerraron y un resumen por forma de pago, para darle seguimiento cuando vuelve.
 */
export default async function RepartidorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ fecha?: string; desde?: string; hasta?: string }>;
}) {
  const { id } = await params;
  const filtros = await searchParams;

  const repartidor = await prisma.repartidor.findUnique({ where: { id } });
  // Quien ya no trabaja como repartidor (dado de baja) deja de ver los pedidos con el mismo enlace: el enlace no se puede
  // cambiar, así que dar de baja es la forma de cortarlo.
  if (!repartidor || !repartidor.activo) notFound();

  // Todo lo que sigue queda atado al local de ESTE repartidor: aunque su enlace circule, nunca muestra pedidos de otro negocio.
  const storeId = repartidor.storeId;

  // El tramo del historial: lo que se eligió, o hoy si no se eligió nada (o si el rango está incompleto o mal escrito).
  const rangoPedido = calcularRangoFecha(filtros.fecha, filtros.desde, filtros.hasta);
  const fechaActiva = rangoPedido ? (filtros.fecha ?? "hoy") : "hoy";
  const rango = rangoPedido ?? calcularRangoFecha("hoy", undefined, undefined)!;

  const ahora = Date.now();
  const desdeReciente = new Date(ahora - HORAS_EN_LA_CALLE * 60 * 60 * 1000);

  const [crudas, cerradas] = await Promise.all([
    // Los pedidos de la ruta: abiertos, y los que la caja cerró hace poco.
    prisma.cuentaDelivery.findMany({
      where: {
        storeId,
        repartidorId: id,
        OR: [{ estado: { in: ["abierta", "por_cobrar"] } }, { estado: { in: ["pagada", "anulada"] }, cerradaEn: { gte: desdeReciente } }],
      },
      include: { items: { where: { estado: "activo" }, orderBy: [{ ronda: "asc" }, { linea: "asc" }] } },
      orderBy: { salioEn: "asc" },
      take: 80,
    }),
    // El historial: las cuentas cerradas del tramo elegido.
    prisma.cuentaDelivery.findMany({
      where: { storeId, repartidorId: id, estado: { in: ["pagada", "anulada"] }, cerradaEn: { gte: rango.gte, lt: rango.lt } },
      select: {
        id: true,
        estado: true,
        clienteNombre: true,
        direccion: true,
        clienteLat: true,
        clienteLng: true,
        cerradaEn: true,
        ventaPosId: true,
      },
      orderBy: { cerradaEn: "desc" },
      take: MAXIMO_HISTORIAL,
    }),
  ]);

  // Con qué se cerró cada cuenta cobrada: las ventas que salieron de ellas, con sus pagos (también del mismo local).
  const idsVentas = [...crudas.map((c) => c.ventaPosId), ...cerradas.map((c) => c.ventaPosId)].filter((v): v is string => !!v);
  const ventas = idsVentas.length
    ? await prisma.ventaPos.findMany({
        where: { storeId, id: { in: [...new Set(idsVentas)] } },
        select: { id: true, formaPago: true, total: true, pagos: { select: { forma: true, monto: true }, orderBy: { orden: "asc" } } },
      })
    : [];
  const ventaPorId = new Map(ventas.map((v) => [v.id, v]));

  // ------------------------------------------------------------------------------ los pedidos de la ruta
  const tarjetas: TarjetaRepartidor[] = crudas
    .map((c) => {
      const cerrada = c.estado === "pagada" || c.estado === "anulada";
      const venta = c.ventaPosId ? ventaPorId.get(c.ventaPosId) : undefined;
      // Lo que se cobra: los productos con su descuento y el envío (la misma cuenta que la caja).
      const totales = totalesDeDelivery(
        c.items.map((i) => ({ precioUnitario: Number(i.precioUnitario), cantidad: i.cantidad })),
        Number(c.costoEnvio),
        descuentoDeCuenta(c)
      );
      const asignadaEn = c.salioEn ?? c.abiertaEn;
      const momento = cerrada && c.cerradaEn ? c.cerradaEn : asignadaEn;
      const tarjeta: TarjetaRepartidor = {
        id: c.id,
        estado: c.estado,
        cliente: c.clienteNombre,
        telefono: c.clienteTelefono,
        direccion: textoSinEnlaces(c.direccion) || null,
        linkMapa: enlaceDeUbicacion(c),
        productos: c.items.map((i) => `${i.cantidad}x ${i.nombreProducto}`).join(", "),
        notas: c.notas,
        horaTexto: hora(momento),
        esNuevo: !cerrada && ahora - asignadaEn.getTime() < MINUTOS_NUEVO * 60 * 1000,
        total: c.estado === "pagada" && venta ? Number(venta.total) : totales.total,
        envio: totales.envio,
        pago: c.estado === "pagada" && venta ? detallePagos(pagosDeVenta(venta)) : null,
        cobroCancelado: c.estado === "anulada" && !!c.ventaPosId,
      };
      return { orden: cerrada ? 1 : 0, momento: momento.getTime(), tarjeta };
    })
    // Primero los que la caja todavía no cerró (del más viejo al más nuevo), después los ya cerrados (el más reciente primero).
    .sort((a, b) => a.orden - b.orden || (a.orden === 0 ? a.momento - b.momento : b.momento - a.momento))
    .map((x) => x.tarjeta);

  // ------------------------------------------------------------------------------ el resumen y las filas del historial
  // El resumen del tramo: cuántos pedidos y cuánto se cobró en total y por cada forma de pago (solo cuentas cobradas).
  let cobradas = 0;
  let totalCobrado = 0;
  const porForma = new Map<string, number>();
  for (const c of cerradas) {
    const v = c.estado === "pagada" && c.ventaPosId ? ventaPorId.get(c.ventaPosId) : undefined;
    if (!v) continue;
    cobradas += 1;
    totalCobrado += Number(v.total);
    for (const p of pagosDeVenta(v)) porForma.set(p.forma, (porForma.get(p.forma) ?? 0) + p.monto);
  }
  const canceladas = cerradas.filter((c) => c.estado === "anulada").length;

  // Las cuentas cerradas hace poco ya están arriba con sus datos: abajo no se repiten (sí cuentan en el resumen). Solo mientras el
  // tramo incluye este momento; en un tramo del pasado se listan todas.
  const incluyeAhora = rango.gte.getTime() <= ahora && ahora < rango.lt.getTime();
  const idsArriba = new Set(tarjetas.map((t) => t.id));
  const filasVisibles = cerradas.filter((c) => !(incluyeAhora && idsArriba.has(c.id)));
  const historial: FilaHistorial[] = filasVisibles.map((c) => {
    const venta = c.ventaPosId ? ventaPorId.get(c.ventaPosId) : undefined;
    return {
      id: c.id,
      cliente: c.clienteNombre,
      fechaTexto: c.cerradaEn ? `${dia(c.cerradaEn)} · ${hora(c.cerradaEn)}` : "",
      direccion: textoSinEnlaces(c.direccion) || null,
      linkMapa: enlaceDeUbicacion(c),
      cancelada: c.estado === "anulada",
      cobroCancelado: c.estado === "anulada" && !!c.ventaPosId,
      pago: venta ? detallePagos(pagosDeVenta(venta)) : null,
      total: venta ? Number(venta.total) : null,
    };
  });

  const fin = new Date(rango.lt.getTime() - 1);
  const texto = dia(rango.gte) === dia(fin) ? dia(rango.gte) : `${dia(rango.gte)} al ${dia(fin)}`;

  return (
    <PantallaRepartidor
      repartidorId={id}
      nombre={repartidor.nombre}
      tarjetas={tarjetas}
      historial={historial}
      resumen={{
        cobradas,
        total: totalCobrado,
        porForma: [...porForma.entries()].map(([forma, monto]) => ({ etiqueta: etiquetaFormaPagoPos(forma), monto })),
        canceladas,
      }}
      tramo={{
        activo: fechaActiva,
        desde: filtros.desde ?? "",
        hasta: filtros.hasta ?? "",
        texto,
        truncado: cerradas.length >= MAXIMO_HISTORIAL,
        arriba: cerradas.length - filasVisibles.length,
      }}
      segundos={SEGUNDOS_ACTUALIZAR}
    />
  );
}
