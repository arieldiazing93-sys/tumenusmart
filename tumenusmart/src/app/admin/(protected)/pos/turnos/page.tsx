import Link from "next/link";
import { pantallaConPermiso } from "@/lib/auth";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { Cabecera, Campo, Entrada, clasesBoton, Tabla, Th, Td, Tr, Vacio, BotonEnlace } from "@/components/ui";
import { calcularRangoFecha, claveDia, type FiltroFecha } from "@/lib/rango-fecha";
import { formatearGuarani } from "@/lib/format";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import { FORMA_PAGO_A_CREDITO } from "@/lib/turno-pos";

export const dynamic = "force-dynamic";

/** La pastilla de un filtro: llena si es la elegida, con borde si no. */
function clasePastilla(activa: boolean): string {
  return `rounded-full border px-3 py-1.5 text-sm font-medium ${
    activa
      ? "border-brand bg-brand text-white"
      : "border-linea text-tinta-media hover:border-brand hover:text-brand"
  }`;
}

function totalDeclarado(t: {
  declaradoEfectivo: unknown;
  declaradoTransferencia: unknown;
  declaradoTarjetaDebito: unknown;
  declaradoTarjetaCredito: unknown;
}): number {
  return (
    Number(t.declaradoEfectivo ?? 0) +
    Number(t.declaradoTransferencia ?? 0) +
    Number(t.declaradoTarjetaDebito ?? 0) +
    Number(t.declaradoTarjetaCredito ?? 0)
  );
}

function totalCalculado(t: {
  calculadoEfectivo: unknown;
  calculadoTransferencia: unknown;
  calculadoTarjetaDebito: unknown;
  calculadoTarjetaCredito: unknown;
}): number {
  return (
    Number(t.calculadoEfectivo ?? 0) +
    Number(t.calculadoTransferencia ?? 0) +
    Number(t.calculadoTarjetaDebito ?? 0) +
    Number(t.calculadoTarjetaCredito ?? 0)
  );
}

export default async function TurnosPosPage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string; desde?: string; hasta?: string; estacion?: string }>;
}) {
  await pantallaConPermiso("pos.verHistorico");

  const { fecha, desde, hasta, estacion } = await searchParams;
  const fechaActiva: FiltroFecha = (fecha as FiltroFecha) ?? "7dias";
  let rango =
    calcularRangoFecha(fechaActiva, desde, hasta) ?? calcularRangoFecha("7dias", undefined, undefined)!;

  // El filtro es un calendario Desde / Hasta. Sin fechas en la dirección arranca
  // en los últimos 7 días, y el calendario muestra siempre el rango que se está
  // viendo, venga como venga en la dirección.
  let diaDesde = claveDia(rango.gte);
  let diaHasta = claveDia(new Date(rango.lt.getTime() - 24 * 60 * 60 * 1000));
  if (diaDesde > diaHasta) {
    // Las escribieron al revés: se dan vuelta en vez de mostrar una lista vacía.
    [diaDesde, diaHasta] = [diaHasta, diaDesde];
    rango = calcularRangoFecha("rango", diaDesde, diaHasta)!;
  }

  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);

  // Todas las estaciones del local, incluso las desactivadas: un turno viejo
  // puede ser de una que ya no se usa. Un id que no existe se ignora (= todas).
  const estaciones = await db.estacion.findMany({
    orderBy: { nombre: "asc" },
    select: { id: true, nombre: true, activa: true },
  });
  const estacionElegida = estaciones.find((e) => e.id === estacion) ?? null;

  // El rango de fechas y la estación se combinan: cambiar la estación conserva
  // las fechas. Los reportes de Excel y PDF reciben el mismo querystring, así
  // salen con exactamente lo que se está viendo.
  function querystring(nueva: { estacion?: string | null }) {
    const e = nueva.estacion === undefined ? (estacionElegida?.id ?? null) : nueva.estacion;
    const params = new URLSearchParams({ fecha: "rango", desde: diaDesde, hasta: diaHasta });
    if (e) params.set("estacion", e);
    return params.toString();
  }
  const querystringActual = () => querystring({});

  const turnos = await db.turnoPos.findMany({
    where: {
      estado: "cerrado",
      cerradoEn: { gte: rango.gte, lt: rango.lt },
      ...(estacionElegida ? { estacionId: estacionElegida.id } : {}),
    },
    orderBy: { cerradoEn: "desc" },
    select: {
      id: true,
      abiertoPor: true,
      cerradoPor: true,
      estacion: { select: { nombre: true } },
      abiertoEn: true,
      cerradoEn: true,
      cantidadVentas: true,
      montoInicial: true,
      movimientosEfectivoNeto: true,
      declaradoEfectivo: true,
      declaradoTransferencia: true,
      declaradoTarjetaDebito: true,
      declaradoTarjetaCredito: true,
      calculadoEfectivo: true,
      calculadoTransferencia: true,
      calculadoTarjetaDebito: true,
      calculadoTarjetaCredito: true,
    },
  });

  // Contraste "hoy" vs. lo congelado al cerrar — mismo criterio que el
  // comprobante individual (ver turnos/[id]/page.tsx, contrastarTurno), pero
  // calculado para toda la lista de una sola vez (2 groupBy en vez de N
  // consultas) para poder avisar acá sin entrar turno por turno. Una venta
  // cancelada o un pedido pasado a "cancelado" DESPUÉS de cerrar el turno es
  // justo lo que esto saca a la luz.
  const turnoIds = turnos.map((t) => t.id);
  const [ventasHoy, pedidosHoy, rendicionesPorTurno, creditoHoy] = turnoIds.length
    ? await Promise.all([
        db.ventaPos.groupBy({
          by: ["turnoPosId"],
          where: { turnoPosId: { in: turnoIds }, cancelada: false },
          _count: { _all: true },
          _sum: { total: true },
        }),
        db.order.groupBy({
          by: ["turnoPosId"],
          where: { turnoPosId: { in: turnoIds }, estado: { not: "cancelado" } },
          _count: { _all: true },
          _sum: { total: true },
        }),
        db.rendicion.groupBy({
          by: ["turnoPosId"],
          where: { turnoPosId: { in: turnoIds } },
          _sum: { totalEfectivo: true, totalTransferencia: true, totalTarjetaDebito: true, totalTarjetaCredito: true },
        }),
        // Las ventas a crédito cuentan como venta pero no como plata cobrada:
        // el total "de hoy" las descuenta, igual que lo congelado al cerrar.
        db.ventaPos.groupBy({
          by: ["turnoPosId"],
          where: { turnoPosId: { in: turnoIds }, cancelada: false, formaPago: FORMA_PAGO_A_CREDITO },
          _sum: { total: true },
        }),
      ])
    : [[], [], [], []];
  // Corte general: lo que el repartidor rindió (en cualquiera de las 4
  // formas) se cuenta junto con el resto de la caja del cajero — sin
  // sumarlo acá, "Sistema" quedaría por debajo de lo declarado y se vería
  // como un sobrante que nunca existió (ver mismo criterio en
  // turnos/[id]/page.tsx).
  const rendidoPorTurno = new Map<string, number>();
  for (const r of rendicionesPorTurno) {
    if (!r.turnoPosId) continue;
    rendidoPorTurno.set(
      r.turnoPosId,
      Number(r._sum.totalEfectivo ?? 0) +
        Number(r._sum.totalTransferencia ?? 0) +
        Number(r._sum.totalTarjetaDebito ?? 0) +
        Number(r._sum.totalTarjetaCredito ?? 0)
    );
  }
  const hoyPorTurno = new Map<string, { cantidad: number; total: number }>();
  for (const v of ventasHoy) {
    const actual = hoyPorTurno.get(v.turnoPosId!) ?? { cantidad: 0, total: 0 };
    actual.cantidad += v._count._all;
    actual.total += Number(v._sum.total ?? 0);
    hoyPorTurno.set(v.turnoPosId!, actual);
  }
  for (const c of creditoHoy) {
    const actual = hoyPorTurno.get(c.turnoPosId!);
    if (actual) actual.total -= Number(c._sum.total ?? 0);
  }
  for (const p of pedidosHoy) {
    const actual = hoyPorTurno.get(p.turnoPosId!) ?? { cantidad: 0, total: 0 };
    actual.cantidad += p._count._all;
    actual.total += Number(p._sum.total ?? 0);
    hoyPorTurno.set(p.turnoPosId!, actual);
  }

  return (
    <div>
      <Cabecera
        titulo="Cierres de turno"
        bajada="Histórico de aperturas y cierres de caja del Punto de Venta."
        acciones={
          <>
            <a
              href={`/admin/pos/turnos/exportar?${querystringActual()}`}
              className={clasesBoton("principal", "sm")}
            >
              Descargar Excel
            </a>
            <a
              href={`/admin/pos/turnos/imprimir?${querystringActual()}`}
              target="_blank"
              rel="noopener noreferrer"
              className={clasesBoton("navegar", "sm")}
            >
              Ver reporte / PDF
            </a>
          </>
        }
      />

      <div className="mb-6 flex flex-col gap-3">
        {/* Solo calendario: rango de fechas, con la estación elegida (si hay) conservada. */}
        <form
          key={`${diaDesde}_${diaHasta}`}
          method="get"
          action="/admin/pos/turnos"
          className="flex flex-wrap items-end gap-3"
        >
          <input type="hidden" name="fecha" value="rango" />
          {estacionElegida && <input type="hidden" name="estacion" value={estacionElegida.id} />}
          <Campo etiqueta="Desde" className="w-44">
            <Entrada type="date" name="desde" defaultValue={diaDesde} required />
          </Campo>
          <Campo etiqueta="Hasta" className="w-44">
            <Entrada type="date" name="hasta" defaultValue={diaHasta} required />
          </Campo>
          <button type="submit" className={clasesBoton("principal", "md")}>
            Filtrar
          </button>
        </form>

        {/* Con una sola estación no hay nada que elegir. */}
        {estaciones.length > 1 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-tinta-suave">Estación:</span>
            <Link href={`/admin/pos/turnos?${querystring({ estacion: null })}`} className={clasePastilla(!estacionElegida)}>
              Todas las estaciones
            </Link>
            {estaciones.map((e) => (
              <Link
                key={e.id}
                href={`/admin/pos/turnos?${querystring({ estacion: e.id })}`}
                className={clasePastilla(estacionElegida?.id === e.id)}
              >
                {e.nombre}
                {!e.activa && " (inactiva)"}
              </Link>
            ))}
          </div>
        )}
      </div>

      {turnos.length === 0 ? (
        <Vacio
          titulo={
            estacionElegida
              ? `No hay turnos cerrados de ${estacionElegida.nombre} en este período`
              : "No hay turnos cerrados en este período"
          }
          detalle="Los cierres de caja del Punto de Venta van a aparecer acá."
        />
      ) : (
        <Tabla>
          <thead>
            <tr>
              <Th>Cajero</Th>
              <Th>Estación</Th>
              <Th>Abrió</Th>
              <Th>Cerró</Th>
              <Th className="text-right">Ventas</Th>
              <Th className="text-right">Sistema</Th>
              <Th className="text-right">Declarado</Th>
              <Th className="text-right">Diferencia</Th>
              <Th className="text-right">
                <span className="sr-only">Acción</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {turnos.map((t) => {
              const calculadoBase = totalCalculado(t);
              const calculado =
                calculadoBase +
                (rendidoPorTurno.get(t.id) ?? 0) +
                Number(t.montoInicial ?? 0) +
                Number(t.movimientosEfectivoNeto ?? 0);
              const declarado = totalDeclarado(t);
              const diferencia = declarado - calculado;
              const hoy = hoyPorTurno.get(t.id) ?? { cantidad: 0, total: 0 };
              const coincideHoy =
                (t.cantidadVentas ?? 0) === hoy.cantidad &&
                Math.round(calculadoBase) === Math.round(hoy.total);
              return (
                <Tr key={t.id}>
                  <Td>
                    <Link
                      href={`/admin/pos/turnos/${t.id}`}
                      className="font-medium text-azul-oscuro hover:underline"
                    >
                      {t.cerradoPor ?? t.abiertoPor}
                    </Link>
                    {!coincideHoy && (
                      <span
                        title="Algo de este turno se canceló después del cierre — el comprobante sigue valiendo lo congelado, ver detalle."
                        className="ml-1.5 text-peligro"
                      >
                        ⚠
                      </span>
                    )}
                  </Td>
                  <Td>{t.estacion.nombre}</Td>
                  <Td>
                    {t.abiertoEn.toLocaleString("es-PY", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: false,
                      timeZone: ZONA_NEGOCIO,
                    })}
                  </Td>
                  <Td>
                    {t.cerradoEn
                      ? t.cerradoEn.toLocaleString("es-PY", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: false,
                          timeZone: ZONA_NEGOCIO,
                        })
                      : "—"}
                  </Td>
                  <Td className="text-right">{t.cantidadVentas ?? 0}</Td>
                  <Td className="cifra text-right">{formatearGuarani(calculado)}</Td>
                  <Td className="cifra text-right font-medium text-tinta">
                    {formatearGuarani(declarado)}
                  </Td>
                  <Td
                    className={`cifra text-right font-medium ${
                      diferencia === 0 ? "text-tinta-suave" : diferencia > 0 ? "text-exito" : "text-peligro"
                    }`}
                  >
                    {diferencia === 0 ? "—" : formatearGuarani(diferencia)}
                  </Td>
                  <Td className="text-right">
                    <BotonEnlace href={`/admin/pos/turnos/${t.id}`} tono="navegar" tam="sm">
                      Ver
                    </BotonEnlace>
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Tabla>
      )}
    </div>
  );
}
