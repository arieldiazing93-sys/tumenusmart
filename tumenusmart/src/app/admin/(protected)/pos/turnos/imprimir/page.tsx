import { pantallaConPermiso } from "@/lib/auth";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual, localActual } from "@/lib/local-actual";
import { calcularRangoFecha } from "@/lib/rango-fecha";
import { formatearGuarani } from "@/lib/format";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import { ImprimirBoton } from "../../../estadisticas/imprimir/ImprimirBoton";

export const dynamic = "force-dynamic";

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

export default async function ImprimirTurnosPosPage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string; desde?: string; hasta?: string; estacion?: string }>;
}) {
  await pantallaConPermiso("pos.verHistorico");

  const { fecha, desde, hasta, estacion } = await searchParams;
  const fechaActiva = fecha ?? "7dias";
  const rango =
    calcularRangoFecha(fechaActiva, desde, hasta) ?? calcularRangoFecha("7dias", undefined, undefined)!;

  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);
  // Una estación puntual, o todas si no viene (o si el id no existe en este local).
  const estacionElegida = estacion
    ? await db.estacion.findFirst({ where: { id: estacion }, select: { id: true, nombre: true } })
    : null;
  const [local, turnos] = await Promise.all([
    localActual(),
    db.turnoPos.findMany({
      where: {
        estado: "cerrado",
        cerradoEn: { gte: rango.gte, lt: rango.lt },
        ...(estacionElegida ? { estacionId: estacionElegida.id } : {}),
      },
      orderBy: { cerradoEn: "asc" },
      select: {
        id: true,
        estacion: { select: { nombre: true } },
        abiertoPor: true,
        cerradoPor: true,
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
    }),
  ]);

  // Corte general: lo que rindió el repartidor (en cualquiera de las 4
  // formas) entra en la misma caja que cuenta el cajero — sin sumarlo acá,
  // "Sistema" queda por debajo de lo declarado y aparenta un sobrante que
  // nunca existió (mismo criterio que turnos/[id]/page.tsx).
  const turnoIds = turnos.map((t) => t.id);
  const rendicionesPorTurno = turnoIds.length
    ? await db.rendicion.groupBy({
        by: ["turnoPosId"],
        where: { turnoPosId: { in: turnoIds } },
        _sum: { totalEfectivo: true, totalTransferencia: true, totalTarjetaDebito: true, totalTarjetaCredito: true },
      })
    : [];
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

  const finRangoInclusive = new Date(rango.lt.getTime() - 24 * 60 * 60 * 1000);
  const opcionesFecha: Intl.DateTimeFormatOptions = {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: ZONA_NEGOCIO,
  };
  const opcionesFechaHora: Intl.DateTimeFormatOptions = {
    ...opcionesFecha,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 print:max-w-none print:px-0 print:py-0">
      <div className="mb-6 flex justify-end print:hidden">
        <ImprimirBoton />
      </div>

      <div className="mb-8 border-b border-linea pb-6">
        <h1 className="text-2xl font-bold text-tinta">Cierres de turno — {local.nombre}</h1>
        <p className="mt-1 text-sm text-tinta-media">
          Período: {rango.gte.toLocaleDateString("es-PY", opcionesFecha)} –{" "}
          {finRangoInclusive.toLocaleDateString("es-PY", opcionesFecha)} ·{" "}
          {estacionElegida ? `Estación: ${estacionElegida.nombre}` : "Todas las estaciones"}
        </p>
      </div>

      {turnos.length === 0 ? (
        <p className="text-sm text-tinta-suave">No se registraron cierres de turno en este período.</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-linea text-left text-xs uppercase tracking-wide text-tinta-media">
              <th className="py-1.5">Cajero</th>
              <th className="py-1.5">Estación</th>
              <th className="py-1.5">Cerró el</th>
              <th className="py-1.5 text-right">Ventas</th>
              <th className="py-1.5 text-right">Sistema</th>
              <th className="py-1.5 text-right">Declarado</th>
              <th className="py-1.5 text-right">Diferencia</th>
            </tr>
          </thead>
          <tbody>
            {turnos.map((t) => {
              const declarado = totalDeclarado(t);
              const calculado =
                totalCalculado(t) + (rendidoPorTurno.get(t.id) ?? 0) + Number(t.montoInicial ?? 0);
              return (
                <tr key={t.id} className="border-b border-linea-fina">
                  <td className="py-1.5">{t.cerradoPor ?? t.abiertoPor}</td>
                  <td className="py-1.5 text-tinta-media">{t.estacion.nombre}</td>
                  <td className="py-1.5 text-tinta-media">
                    {t.cerradoEn ? t.cerradoEn.toLocaleString("es-PY", opcionesFechaHora) : "—"}
                  </td>
                  <td className="py-1.5 text-right text-tinta-media">{t.cantidadVentas ?? 0}</td>
                  <td className="cifra py-1.5 text-right">{formatearGuarani(calculado)}</td>
                  <td className="cifra py-1.5 text-right font-medium">{formatearGuarani(declarado)}</td>
                  <td className="cifra py-1.5 text-right">
                    {declarado - calculado === 0 ? "—" : formatearGuarani(declarado - calculado)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
