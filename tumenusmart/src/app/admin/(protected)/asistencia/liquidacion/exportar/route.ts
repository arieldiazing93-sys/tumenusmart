import { NextRequest, NextResponse } from "next/server";
import { exigirPermiso } from "@/lib/auth";
import { idLocalActual, localActual } from "@/lib/local-actual";
import { prismaDelLocal } from "@/lib/prisma-local";
import { AVISO_REFERENCIA_LIQUIDACION, etiquetaDeFormaDePago, resumenDeDiasTrabajo } from "@/lib/ausencias";
import { cargarLiquidacion, periodoDeLiquidacion } from "@/lib/liquidacion-asistencia";
import { diaEnTexto } from "@/lib/rango-dias";
import { filaTitulo, nuevoLibro, respuestaXlsx } from "@/lib/excel-reporte";

export const dynamic = "force-dynamic";

const FORMATO_GUARANIES = "#,##0";

/**
 * El Excel de la liquidación: lo mismo que se ve en pantalla, con dos hojas: "Liquidación" (una fila por persona, con lo que le
 * corresponde) y "Detalle por día" (qué pasó cada día de cada persona, con el motivo y si cuenta). Es del dueño: son sueldos.
 */
export async function GET(request: NextRequest) {
  // Ruta de API: no pasa por el layout del panel, así que valida la sesión y el permiso por su cuenta.
  try {
    await exigirPermiso("asistencia.gestionar");
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const pedido = periodoDeLiquidacion(searchParams.get("fecha"), searchParams.get("desde"), searchParams.get("hasta"));
  const db = prismaDelLocal(await idLocalActual());
  const [reporte, local] = await Promise.all([cargarLiquidacion(db, { desde: pedido.desde, hasta: pedido.hasta }), localActual()]);
  const { filas, totales, desde, hasta } = reporte;
  const textoPeriodo = desde === hasta ? diaEnTexto(desde) : `${diaEnTexto(desde)} - ${diaEnTexto(hasta)}`;

  // ---------- hoja 1: una fila por persona ----------
  const { libro, hoja } = nuevoLibro("Liquidación");
  hoja.columns = [
    { width: 30 },
    { width: 20 },
    { width: 18 },
    { width: 12 },
    { width: 16 },
    { width: 12 },
    { width: 10 },
    { width: 10 },
    { width: 14 },
    { width: 14 },
    { width: 12 },
    { width: 12 },
    { width: 14 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
  ];
  filaTitulo(hoja, ["Negocio", local.nombre], 2);
  filaTitulo(hoja, ["Reporte", "Liquidación del personal"], 2);
  filaTitulo(hoja, ["Período", textoPeriodo], 2);
  filaTitulo(hoja, [AVISO_REFERENCIA_LIQUIDACION.titulo, "No es una liquidación legal: ver la nota al pie."], 2);
  hoja.addRow([]);

  filaTitulo(
    hoja,
    [
      "Colaborador",
      "Cargo",
      "Días de trabajo",
      "Pago",
      "Monto",
      "Tenía que ir",
      "Fue",
      "Días extra",
      "Justificados (se pagan)",
      "Justificados (sin goce)",
      "Faltas sin aviso",
      "Llegadas tarde",
      "Valor del día",
      "Bruto",
      "Descuento",
      "A pagar",
    ],
    16
  );
  for (const f of filas) {
    const fila = hoja.addRow([
      f.nombre + (f.activo ? "" : " (inactivo)"),
      f.cargo ?? "",
      resumenDeDiasTrabajo(f.diasTrabajo),
      f.sinFormaDePago ? "Sin definir" : etiquetaDeFormaDePago(f.forma),
      f.sinFormaDePago ? "" : f.monto,
      f.resumen.esperados,
      f.resumen.trabajados,
      f.resumen.extra,
      f.resumen.justificadosPagados,
      f.resumen.justificadosSinGoce,
      f.resumen.faltas,
      f.tardanzas,
      f.sinFormaDePago ? "" : f.liquidacion.valorDia,
      f.sinFormaDePago ? "" : f.liquidacion.bruto,
      f.sinFormaDePago ? "" : f.liquidacion.descuento,
      f.sinFormaDePago ? "" : f.liquidacion.neto,
    ]);
    for (const c of [5, 13, 14, 15, 16]) fila.getCell(c).numFmt = FORMATO_GUARANIES;
  }
  hoja.addRow([]);
  const total = filaTitulo(
    hoja,
    ["TOTAL", "", "", "", "", "", "", "", "", "", totales.faltas, totales.tardanzas, "", totales.bruto, totales.descuento, totales.neto],
    16
  );
  for (const c of [14, 15, 16]) total.getCell(c).numFmt = FORMATO_GUARANIES;

  hoja.addRow([]);
  hoja.addRow([`${AVISO_REFERENCIA_LIQUIDACION.titulo}. ${AVISO_REFERENCIA_LIQUIDACION.texto}`]);
  hoja.addRow([
    "Mensual: el salario del período menos un día (el salario ÷ 30) por cada falta sin aviso y por cada día justificado sin goce. Jornal: un jornal por cada día que fue y por cada día justificado que se le paga.",
  ]);
  hoja.addRow([
    "Tenía que ir: los días de trabajo de la persona dentro del período que ya pasaron (o están justificados). Los días de hoy sin marcar y los que vienen todavía no cuentan como falta. Las llegadas tarde son informativas: no se descuentan.",
  ]);
  if (totales.sinFormaDePago > 0) {
    hoja.addRow([]);
    hoja.addRow([`${totales.sinFormaDePago} persona(s) sin forma de pago definida: no se les calculó el monto.`]);
  }
  if (reporte.recortado) {
    hoja.addRow([]);
    hoja.addRow(["Se pidieron más días de los permitidos: se acotó el período a los últimos 62 días."]);
  }
  if (reporte.incompleta) {
    hoja.addRow([]);
    hoja.addRow(["Hay tantas marcaciones que la lista se cortó: los días trabajados pueden estar incompletos. Acotá el período."]);
  }
  if (filas.length === 0) {
    hoja.addRow([]);
    hoja.addRow(["No hay personal para liquidar en este período."]);
  }

  // ---------- hoja 2: qué pasó cada día ----------
  const detalle = libro.addWorksheet("Detalle por día");
  detalle.columns = [{ width: 30 }, { width: 14 }, { width: 18 }, { width: 38 }, { width: 14 }, { width: 14 }, { width: 60 }];
  filaTitulo(detalle, ["Colaborador", "Día", "Día de la semana", "Qué pasó", "Cuenta", "Llegó tarde (min)", "Comentario"], 7);
  for (const f of filas) {
    for (const d of f.detalle) {
      detalle.addRow([
        f.nombre,
        diaEnTexto(d.dia),
        d.diaTexto.split(" ")[0],
        d.etiqueta,
        d.efecto === "paga" ? "Se paga" : d.efecto === "descuenta" ? "Descuenta" : "Pendiente",
        d.tardanzaMin ?? "",
        d.nota ?? "",
      ]);
    }
  }
  if (!filas.some((f) => f.detalle.length > 0)) {
    detalle.addRow([]);
    detalle.addRow(["No hay días con movimiento en este período."]);
  }

  return respuestaXlsx(libro, `liquidacion_${desde}_${hasta}.xlsx`);
}
