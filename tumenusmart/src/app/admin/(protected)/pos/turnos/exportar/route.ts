import { NextRequest, NextResponse } from "next/server";
import { haySesionAdminValida } from "@/lib/auth";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual, localActual } from "@/lib/local-actual";
import { calcularRangoFecha } from "@/lib/rango-fecha";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import { nuevoLibro, filaTitulo, respuestaXlsx } from "@/lib/excel-reporte";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!(await haySesionAdminValida())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const fecha = searchParams.get("fecha") ?? "7dias";
  const desde = searchParams.get("desde") ?? undefined;
  const hasta = searchParams.get("hasta") ?? undefined;

  const rango = calcularRangoFecha(fecha, desde, hasta) ?? calcularRangoFecha("7dias", undefined, undefined)!;

  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);
  const [local, turnos] = await Promise.all([
    localActual(),
    db.turnoPos.findMany({
      where: { estado: "cerrado", cerradoEn: { gte: rango.gte, lt: rango.lt } },
      orderBy: { cerradoEn: "asc" },
      select: {
        id: true,
        estacion: { select: { nombre: true } },
        abiertoPor: true,
        cerradoPor: true,
        abiertoEn: true,
        cerradoEn: true,
        cantidadVentas: true,
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
  // "Diferencia" muestra un sobrante que nunca existió (mismo criterio que
  // turnos/[id]/page.tsx).
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
  };
  const periodo = `${rango.gte.toLocaleDateString("es-PY", opcionesFecha)} - ${finRangoInclusive.toLocaleDateString("es-PY", opcionesFecha)}`;

  const { libro, hoja } = nuevoLibro("Cierres POS");
  hoja.columns = [
    { width: 16 },
    { width: 18 },
    { width: 18 },
    { width: 18 },
    { width: 10 },
    { width: 16 },
    { width: 18 },
    { width: 14 },
    { width: 14 },
    { width: 20 },
    { width: 16 },
  ];

  filaTitulo(hoja, ["Negocio", local.nombre], 2);
  filaTitulo(hoja, ["Reporte", "Cierres de turno — Punto de venta"], 2);
  filaTitulo(hoja, ["Período", periodo], 2);
  hoja.addRow([]);

  filaTitulo(
    hoja,
    [
      "Estación",
      "Abrió",
      "Cerró",
      "Cerrado el",
      "Ventas",
      "Efectivo (Gs.)",
      "Transferencia (Gs.)",
      "Débito (Gs.)",
      "Crédito (Gs.)",
      "Total declarado (Gs.)",
      "Diferencia (Gs.)",
    ],
    11
  );

  let totalDeclaradoGeneral = 0;
  let totalDiferenciaGeneral = 0;
  for (const t of turnos) {
    const declarado = {
      efectivo: Math.round(Number(t.declaradoEfectivo ?? 0)),
      transferencia: Math.round(Number(t.declaradoTransferencia ?? 0)),
      debito: Math.round(Number(t.declaradoTarjetaDebito ?? 0)),
      credito: Math.round(Number(t.declaradoTarjetaCredito ?? 0)),
    };
    const totalDeclarado = declarado.efectivo + declarado.transferencia + declarado.debito + declarado.credito;
    const totalCalculado =
      Math.round(Number(t.calculadoEfectivo ?? 0)) +
      Math.round(Number(t.calculadoTransferencia ?? 0)) +
      Math.round(Number(t.calculadoTarjetaDebito ?? 0)) +
      Math.round(Number(t.calculadoTarjetaCredito ?? 0)) +
      Math.round(rendidoPorTurno.get(t.id) ?? 0);
    const diferencia = totalDeclarado - totalCalculado;
    totalDeclaradoGeneral += totalDeclarado;
    totalDiferenciaGeneral += diferencia;

    const fila = hoja.addRow([
      t.estacion.nombre,
      t.abiertoPor,
      t.cerradoPor ?? "",
      t.cerradoEn ? t.cerradoEn.toLocaleString("es-PY", opcionesFechaHora) : "",
      t.cantidadVentas ?? 0,
      declarado.efectivo,
      declarado.transferencia,
      declarado.debito,
      declarado.credito,
      totalDeclarado,
      diferencia,
    ]);
    for (const col of [6, 7, 8, 9, 10, 11]) fila.getCell(col).numFmt = "#,##0";
  }

  hoja.addRow([]);
  const filaTotal = filaTitulo(
    hoja,
    ["", "", "", "", "", "", "", "", "TOTAL GENERAL (Gs.)", totalDeclaradoGeneral, totalDiferenciaGeneral],
    11
  );
  filaTotal.getCell(10).numFmt = "#,##0";
  filaTotal.getCell(11).numFmt = "#,##0";

  if (turnos.length === 0) {
    hoja.addRow([]);
    hoja.addRow(["No se registraron cierres de turno en este período."]);
  }

  return respuestaXlsx(libro, `cierres_pos_${fecha}.xlsx`);
}
