import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatearGuarani } from "@/lib/format";
import { descuentoDeCuenta } from "@/lib/comedor";
import { totalesDeDelivery } from "@/lib/delivery";
import { calcularRangoFecha } from "@/lib/rango-fecha";
import { detallePagos } from "@/lib/pago-venta";
import { etiquetaFormaPagoPos } from "@/lib/turno-pos";
import { enlaceDeMapa, extraerUbicacion, primerEnlace, textoSinEnlaces } from "@/lib/ubicacion-mapa";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import { RefrescarCada } from "@/components/RefrescarCada";
import { clasesBoton } from "@/components/ui";

export const dynamic = "force-dynamic";

/** Cada cuántos segundos la pantalla del repartidor vuelve a consultar sola (un minuto). */
const SEGUNDOS_ACTUALIZAR = 60;
/** Un pedido recién asignado se marca como "Nuevo" durante estos minutos. */
const MINUTOS_NUEVO = 3;
/** Cuántos pedidos como máximo trae el historial de una consulta (un tramo muy largo se acota). */
const MAXIMO_HISTORIAL = 400;

const FILTROS: { valor: string; texto: string }[] = [
  { valor: "hoy", texto: "Hoy" },
  { valor: "ayer", texto: "Ayer" },
  { valor: "7dias", texto: "7 días" },
  { valor: "mes", texto: "Este mes" },
];

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
 * cuentas de SU local y asignadas a él, y no hace nada más que mostrar (no hay ningún botón que cambie datos).
 *
 *  - "Para entregar": los pedidos que la caja le asignó y siguen abiertos. Asignarlo ya lo manda a trabajar: el pedido aparece solo
 *    (la página se actualiza sola cada pocos segundos), con un cartel de "Nuevo" al principio.
 *  - "Historial": las cuentas que la caja ya cerró, en el tramo de fechas que se elija (hoy por defecto), con la forma de pago con
 *    la que se cerraron y un resumen por forma de pago, para darle seguimiento cuando vuelve.
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

  const [pendientes, cerradas] = await Promise.all([
    prisma.cuentaDelivery.findMany({
      where: { storeId, repartidorId: id, estado: { in: ["abierta", "por_cobrar"] } },
      include: { items: { where: { estado: "activo" }, orderBy: [{ ronda: "asc" }, { linea: "asc" }] } },
      orderBy: { salioEn: "asc" },
    }),
    prisma.cuentaDelivery.findMany({
      where: { storeId, repartidorId: id, estado: { in: ["pagada", "anulada"] }, cerradaEn: { gte: rango.gte, lt: rango.lt } },
      select: {
        id: true,
        numero: true,
        estado: true,
        clienteNombre: true,
        clienteTelefono: true,
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
  const idsVentas = cerradas.map((c) => c.ventaPosId).filter((v): v is string => !!v);
  const ventas = idsVentas.length
    ? await prisma.ventaPos.findMany({
        where: { storeId, id: { in: idsVentas } },
        select: { id: true, formaPago: true, total: true, pagos: { select: { forma: true, monto: true }, orderBy: { orden: "asc" } } },
      })
    : [];
  const ventaPorId = new Map(ventas.map((v) => [v.id, v]));

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

  const ahora = Date.now();
  const generadoEn = new Date(ahora).toISOString();
  const textoTramo =
    dia(rango.gte) === dia(new Date(rango.lt.getTime() - 1)) ? dia(rango.gte) : `${dia(rango.gte)} al ${dia(new Date(rango.lt.getTime() - 1))}`;

  return (
    <main className="mx-auto max-w-md px-4 py-6">
      <h1 className="text-xl font-bold text-neutral-900">Hola, {repartidor.nombre} 👋</h1>
      <p className="mb-1 text-sm text-neutral-500">
        {pendientes.length === 0
          ? "No tenés pedidos asignados en este momento."
          : `Tenés ${pendientes.length} ${pendientes.length === 1 ? "pedido" : "pedidos"} para entregar.`}
      </p>
      {/* Se actualiza sola cada minuto: cuando la caja te asigna un pedido, aparece acá sin que hagas nada (y en el acto, con
          "Actualizar" o al volver a abrir la pantalla). */}
      <div className="mb-5">
        <RefrescarCada segundos={SEGUNDOS_ACTUALIZAR} generadoEn={generadoEn} />
      </div>

      <div className="flex flex-col gap-4">
        {pendientes.map((cuenta) => {
          const resumenProductos = cuenta.items.map((i) => `${i.cantidad}x ${i.nombreProducto}`).join(", ");
          // Lo que se cobra: los productos con su descuento y el envío (la misma cuenta que la caja).
          const totales = totalesDeDelivery(
            cuenta.items.map((i) => ({ precioUnitario: Number(i.precioUnitario), cantidad: i.cantidad })),
            Number(cuenta.costoEnvio),
            descuentoDeCuenta(cuenta)
          );
          const linkUbicacion = enlaceDeUbicacion(cuenta);
          const direccionEscrita = textoSinEnlaces(cuenta.direccion);
          const asignadaEn = cuenta.salioEn ?? cuenta.abiertaEn;
          const esNuevo = ahora - asignadaEn.getTime() < MINUTOS_NUEVO * 60 * 1000;

          return (
            <div key={cuenta.id} className={`rounded-xl border bg-white p-4 shadow-sm ${esNuevo ? "border-2 border-aviso" : "border-brand"}`}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="font-semibold text-neutral-900">{cuenta.clienteNombre}</span>
                <span className="flex items-center gap-2 text-xs text-neutral-400">
                  {esNuevo && <span className="rounded-full bg-aviso px-2 py-0.5 text-[0.7rem] font-bold uppercase text-white">Nuevo</span>}
                  {hora(asignadaEn)}
                </span>
              </div>

              <a href={`tel:${cuenta.clienteTelefono}`} className="mb-2 block text-sm text-brand">
                📞 {cuenta.clienteTelefono}
              </a>

              {direccionEscrita ? (
                <p className="mb-2 text-sm text-neutral-700">📍 {direccionEscrita}</p>
              ) : (
                !linkUbicacion && <p className="mb-2 text-sm text-neutral-700">📍 Sin referencia de dirección</p>
              )}

              {/* Botón grande: con un toque abre el mapa con la ubicación del cliente. */}
              {linkUbicacion && (
                <a
                  href={linkUbicacion}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mb-3 flex items-center justify-center gap-2 rounded-lg bg-brand px-4 py-3 text-sm font-semibold text-white hover:bg-brand-dark"
                >
                  📍 Abrir la ubicación del cliente en el mapa
                </a>
              )}

              <div className="mb-3 rounded-lg bg-neutral-50 p-2 text-xs text-neutral-600">{resumenProductos || "Sin productos cargados todavía."}</div>
              {cuenta.notas && <p className="mb-3 text-xs text-neutral-600">Nota: {cuenta.notas}</p>}

              <div className="mb-3 flex items-center justify-between text-sm">
                <span className="font-semibold text-neutral-900">{formatearGuarani(totales.total)}</span>
                <span className="text-xs text-neutral-500">incluye {formatearGuarani(totales.envio)} de envío</span>
              </div>

              {/* La caja cobra la cuenta cuando la cierra: hasta entonces el repartidor cobra al cliente y trae la plata. */}
              <p className="rounded-md bg-aviso-luz px-2.5 py-2 text-[0.82rem] font-medium text-aviso">
                Todavía no está cobrado: cobrale {formatearGuarani(totales.total)} al cliente y traelo a la caja.
                {cuenta.estado === "abierta" && " El total puede cambiar si la caja le agrega algo."}
              </p>
              <p className="mt-2 text-[0.72rem] text-neutral-400">
                Cuando la caja cierre la cuenta, la ves en tu historial con la forma de pago con la que se cerró.
              </p>
            </div>
          );
        })}
      </div>

      {/* --------------------------------------------------------------------------------------------- historial */}
      <section className="mt-8">
        <h2 className="mb-2 text-sm font-semibold text-neutral-700">Mi historial</h2>
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          {FILTROS.map((f) => (
            <Link key={f.valor} href={`/repartidor/${id}?fecha=${f.valor}`} className={clasesBoton(fechaActiva === f.valor ? "principal" : "suave", "sm")}>
              {f.texto}
            </Link>
          ))}
        </div>
        {/* Un tramo a elección: desde y hasta (el día "hasta" entra completo). */}
        <form method="get" className="mb-3 flex flex-wrap items-end gap-2">
          <input type="hidden" name="fecha" value="rango" />
          <label className="flex flex-col text-[0.7rem] font-semibold uppercase text-neutral-500">
            Desde
            <input
              type="date"
              name="desde"
              required
              defaultValue={fechaActiva === "rango" ? filtros.desde : undefined}
              className="mt-0.5 rounded-lg border border-neutral-300 px-2 py-1.5 text-sm font-normal normal-case text-neutral-900"
            />
          </label>
          <label className="flex flex-col text-[0.7rem] font-semibold uppercase text-neutral-500">
            Hasta
            <input
              type="date"
              name="hasta"
              required
              defaultValue={fechaActiva === "rango" ? filtros.hasta : undefined}
              className="mt-0.5 rounded-lg border border-neutral-300 px-2 py-1.5 text-sm font-normal normal-case text-neutral-900"
            />
          </label>
          <button type="submit" className={clasesBoton("principal", "sm")}>
            Ver tramo
          </button>
        </form>

        <p className="mb-3 text-xs text-neutral-500">
          Cuentas cerradas por la caja · {textoTramo}
          {cerradas.length >= MAXIMO_HISTORIAL && ` · se muestran las últimas ${MAXIMO_HISTORIAL}`}
        </p>

        {cerradas.length === 0 ? (
          <p className="rounded-lg bg-neutral-50 px-3 py-3 text-sm text-neutral-500">No hay cuentas cerradas en este tramo.</p>
        ) : (
          <>
            {/* El resumen del tramo: cuánto se cobró en total y con qué forma de pago. */}
            <div className="mb-3 rounded-xl border border-neutral-200 bg-white p-3">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-semibold text-neutral-900">
                  {cobradas} {cobradas === 1 ? "pedido cobrado" : "pedidos cobrados"}
                </p>
                <p className="text-sm font-bold text-neutral-900">{formatearGuarani(totalCobrado)}</p>
              </div>
              {porForma.size > 0 && (
                <ul className="mt-2 flex flex-col gap-0.5 border-t border-neutral-100 pt-2">
                  {[...porForma.entries()].map(([forma, monto]) => (
                    <li key={forma} className="flex items-center justify-between text-xs text-neutral-600">
                      <span>{etiquetaFormaPagoPos(forma)}</span>
                      <span className="font-medium text-neutral-900">{formatearGuarani(monto)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {canceladas > 0 && (
                <p className="mt-2 text-xs text-neutral-400">
                  {canceladas} {canceladas === 1 ? "cuenta se canceló" : "cuentas se cancelaron"} sin cobrarse (no suman).
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              {cerradas.map((c) => {
                const venta = c.ventaPosId ? ventaPorId.get(c.ventaPosId) : undefined;
                const cancelada = c.estado === "anulada";
                const linkUbicacion = enlaceDeUbicacion(c);
                const direccionEscrita = textoSinEnlaces(c.direccion);
                const pagos = venta ? pagosDeVenta(venta) : [];
                return (
                  <div key={c.id} className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-neutral-900">{c.clienteNombre}</span>
                      <span className="text-xs text-neutral-400">
                        {c.cerradaEn ? `${dia(c.cerradaEn)} · ${hora(c.cerradaEn)}` : ""}
                      </span>
                    </div>
                    {direccionEscrita && <p className="truncate text-xs text-neutral-500">📍 {direccionEscrita}</p>}
                    <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                      {cancelada ? (
                        <span className="rounded-full bg-peligro-luz px-2 py-0.5 text-xs font-semibold text-peligro">
                          {c.ventaPosId ? "Cobro cancelado" : "Cuenta cancelada"}
                        </span>
                      ) : (
                        <span className="rounded-full bg-exito-luz px-2 py-0.5 text-xs font-semibold text-exito">
                          {pagos.length > 0 ? `Cobrado: ${detallePagos(pagos)}` : "Cobrado"}
                        </span>
                      )}
                      {!cancelada && venta && <span className="font-semibold text-neutral-900">{formatearGuarani(Number(venta.total))}</span>}
                    </div>
                    {linkUbicacion && !cancelada && (
                      <a
                        href={linkUbicacion}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-block text-xs font-medium text-brand hover:underline"
                      >
                        Ver la ubicación en el mapa
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
