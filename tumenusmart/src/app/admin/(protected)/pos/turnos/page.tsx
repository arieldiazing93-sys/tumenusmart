import Link from "next/link";
import { pantallaConPermiso } from "@/lib/auth";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { Cabecera, clasesBoton, Tabla, Th, Td, Tr, Vacio, BotonEnlace } from "@/components/ui";
import { calcularRangoFecha, type FiltroFecha } from "@/lib/rango-fecha";
import { formatearGuarani } from "@/lib/format";
import { ZONA_NEGOCIO } from "@/lib/timezone";

export const dynamic = "force-dynamic";

const FILTROS_FECHA: { value: FiltroFecha; label: string }[] = [
  { value: "hoy", label: "Hoy" },
  { value: "ayer", label: "Ayer" },
  { value: "7dias", label: "Últimos 7 días" },
  { value: "30dias", label: "Últimos 30 días" },
  { value: "mes", label: "Este mes" },
];

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
  const rango =
    calcularRangoFecha(fechaActiva, desde, hasta) ?? calcularRangoFecha("7dias", undefined, undefined)!;

  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);

  // Todas las estaciones del local, incluso las desactivadas: un turno viejo
  // puede ser de una que ya no se usa. Un id que no existe se ignora (= todas).
  const estaciones = await db.estacion.findMany({
    orderBy: { nombre: "asc" },
    select: { id: true, nombre: true, activa: true },
  });
  const estacionElegida = estaciones.find((e) => e.id === estacion) ?? null;

  // El filtro de fecha y el de estación se combinan: cambiar uno conserva el
  // otro. Los reportes de Excel y PDF reciben el mismo querystring, así salen
  // con exactamente lo que se está viendo.
  function querystring(nueva: { fecha?: FiltroFecha; estacion?: string | null }) {
    const f = nueva.fecha ?? fechaActiva;
    const e = nueva.estacion === undefined ? (estacionElegida?.id ?? null) : nueva.estacion;
    const params = new URLSearchParams();
    params.set("fecha", f);
    if (f === "rango" && desde) params.set("desde", desde);
    if (f === "rango" && hasta) params.set("hasta", hasta);
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
  const [ventasHoy, pedidosHoy, rendicionesPorTurno] = turnoIds.length
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
      ])
    : [[], [], []];
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
        <div className="flex flex-wrap items-center gap-2">
          {FILTROS_FECHA.map((f) => (
            <Link
              key={f.value}
              href={`/admin/pos/turnos?${querystring({ fecha: f.value })}`}
              className={clasePastilla(fechaActiva === f.value && fechaActiva !== "rango")}
            >
              {f.label}
            </Link>
          ))}
        </div>

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
                calculadoBase + (rendidoPorTurno.get(t.id) ?? 0) + Number(t.montoInicial ?? 0);
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
