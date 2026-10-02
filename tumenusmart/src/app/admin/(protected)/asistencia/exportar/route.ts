import { NextRequest, NextResponse } from "next/server";
import { exigirPermiso } from "@/lib/auth";
import { idLocalActual, localActual } from "@/lib/local-actual";
import { prismaDelLocal } from "@/lib/prisma-local";
import {
  ETIQUETA_TIPO_CORTA,
  formatearDuracion,
  nombreDeColaborador,
  type EstadoTurno,
  type FilaAsistencia,
} from "@/lib/asistencia";
import { diaEnTexto } from "@/lib/rango-dias";
import { MARCACIONES_MAXIMAS_EXCEL, cargarReporteAsistencia } from "@/lib/reporte-asistencia";
import { filaTitulo, nuevoLibro, respuestaXlsx } from "@/lib/excel-reporte";

export const dynamic = "force-dynamic";

const TEXTO_ESTADO: Record<EstadoTurno, string> = {
  completo: "Completo",
  en_curso: "En el trabajo",
  incompleto: "Incompleto",
};

/** Para el nombre del archivo: sin tildes ni espacios ni nada raro. */
function paraArchivo(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Horas en decimal con dos cifras (8 h 30 min = 8,5), para poder sumar y multiplicar en la planilla. */
function horasDecimales(minutos: number | null): number | string {
  return minutos === null ? "" : Math.round((minutos / 60) * 100) / 100;
}

/**
 * El Excel de Marcaciones: lo mismo que se ve en pantalla (una persona o todas, en el período elegido), con dos hojas:
 * "Resumen" (una fila por persona, con sus horas y llegadas tarde) y "Detalle" (un turno por fila, con las cuatro horas
 * — entrada, salida a almorzar, vuelta y salida —, lo trabajado y lo que conviene revisar). Es del dueño: son datos del
 * personal.
 */
export async function GET(request: NextRequest) {
  // Ruta de API: no pasa por el layout del panel, así que valida la sesión y el permiso por su cuenta.
  try {
    await exigirPermiso("asistencia.gestionar");
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const db = prismaDelLocal(await idLocalActual());

  const reporte = await cargarReporteAsistencia(
    db,
    {
      desde: searchParams.get("desde"),
      hasta: searchParams.get("hasta"),
      buscar: searchParams.get("buscar"),
    },
    MARCACIONES_MAXIMAS_EXCEL
  );
  const { desde, hasta, buscar, personaElegida, resumenPorPersona, minutosTotales, tardanzas, paraRevisar, hayMas } = reporte;
  // En el Excel va en orden cronológico (de lo más viejo a lo más nuevo), que es como se lee una planilla.
  const filas: FilaAsistencia[] = [...reporte.filas].sort((a, b) => {
    if (a.dia !== b.dia) return a.dia < b.dia ? -1 : 1;
    if (a.nombre !== b.nombre) return a.nombre.localeCompare(b.nombre, "es");
    return (a.celdas.entrada?.hora ?? "").localeCompare(b.celdas.entrada?.hora ?? "");
  });

  const local = await localActual();
  const textoPeriodo = desde === hasta ? diaEnTexto(desde) : `${diaEnTexto(desde)} - ${diaEnTexto(hasta)}`;
  const quien = personaElegida
    ? nombreDeColaborador(personaElegida)
    : buscar
      ? `Búsqueda: ${buscar}`
      : "Todo el personal";

  // ---------- hoja 1: el resumen por persona ----------
  const { libro, hoja: resumen } = nuevoLibro("Resumen");
  resumen.columns = [{ width: 32 }, { width: 22 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 16 }, { width: 18 }];

  filaTitulo(resumen, ["Negocio", local.nombre], 2);
  filaTitulo(resumen, ["Reporte", "Registro de asistencia"], 2);
  filaTitulo(resumen, ["Personal", quien], 2);
  filaTitulo(resumen, ["Período", textoPeriodo], 2);
  resumen.addRow([]);

  filaTitulo(
    resumen,
    ["Colaborador", "Cargo", "Días con marcación", "Trabajado", "Horas (decimal)", "Llegadas tarde", "Turnos para revisar"],
    7
  );
  for (const r of resumenPorPersona) {
    const fila = resumen.addRow([
      nombreDeColaborador(r.persona),
      r.persona.cargo ?? "",
      r.dias,
      formatearDuracion(r.minutos),
      horasDecimales(r.minutos),
      r.tardanzas,
      r.pendientes,
    ]);
    fila.getCell(5).numFmt = "0.00";
  }
  resumen.addRow([]);
  const total = filaTitulo(
    resumen,
    [
      "TOTAL",
      "",
      "",
      formatearDuracion(minutosTotales),
      horasDecimales(minutosTotales),
      tardanzas,
      paraRevisar,
    ],
    7
  );
  total.getCell(5).numFmt = "0.00";

  resumen.addRow([]);
  resumen.addRow([
    "Lo trabajado es lo que pasó entre la entrada y la salida, sin contar el almuerzo (si marcó la salida a almorzar y la vuelta). Un turno sin salida no suma horas.",
  ]);
  resumen.addRow([
    "Llegadas tarde: las que pasaron la tolerancia de cada persona. Turnos para revisar: sin entrada, sin salida, sin vuelta del almuerzo o marcados sin que la cámara viera la cara.",
  ]);
  if (reporte.recortado) {
    resumen.addRow([]);
    resumen.addRow(["Se pidieron más días de los permitidos: se acotó el período a los últimos 62 días."]);
  }
  if (filas.length === 0) {
    resumen.addRow([]);
    resumen.addRow(["No hay marcaciones en este período."]);
  }

  // ---------- hoja 2: un turno por fila ----------
  const detalle = libro.addWorksheet("Detalle");
  detalle.columns = [
    { width: 12 },
    { width: 28 },
    { width: 20 },
    { width: 10 },
    { width: 16 },
    { width: 10 },
    { width: 10 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 16 },
    { width: 16 },
    { width: 60 },
  ];
  filaTitulo(
    detalle,
    [
      "Día",
      "Colaborador",
      "Cargo",
      ETIQUETA_TIPO_CORTA.entrada,
      ETIQUETA_TIPO_CORTA.salida_almuerzo,
      ETIQUETA_TIPO_CORTA.vuelta_almuerzo,
      ETIQUETA_TIPO_CORTA.salida,
      "Almuerzo",
      "Trabajado",
      "Horas (decimal)",
      "Tarde (min)",
      "Estado",
      "Observaciones",
    ],
    13
  );
  for (const f of filas) {
    const fila = detalle.addRow([
      diaEnTexto(f.dia),
      f.nombre,
      f.cargo ?? "",
      f.celdas.entrada?.hora ?? "",
      f.celdas.salida_almuerzo?.hora ?? "",
      f.celdas.vuelta_almuerzo?.hora ?? "",
      f.celdas.salida?.hora ?? "",
      f.minutosAlmuerzo !== null ? formatearDuracion(f.minutosAlmuerzo) : "",
      f.minutosTrabajados !== null ? formatearDuracion(f.minutosTrabajados) : "",
      horasDecimales(f.minutosTrabajados),
      f.tardanzaMin ?? "",
      TEXTO_ESTADO[f.estado],
      f.avisos.join(" · "),
    ]);
    fila.getCell(10).numFmt = "0.00";
  }
  if (filas.length > 0) {
    detalle.addRow([]);
    const totalDetalle = filaTitulo(
      detalle,
      ["TOTAL", "", "", "", "", "", "", "", formatearDuracion(minutosTotales), horasDecimales(minutosTotales), "", "", ""],
      13
    );
    totalDetalle.getCell(10).numFmt = "0.00";
  }
  if (hayMas) {
    detalle.addRow([]);
    detalle.addRow([
      `Se listan las primeras ${MARCACIONES_MAXIMAS_EXCEL} marcaciones del período; puede faltar alguna. Acotá el período para ver todo.`,
    ]);
  }

  const nombreArchivo = `asistencia_${paraArchivo(quien) || "personal"}_${desde}_${hasta}.xlsx`;
  return respuestaXlsx(libro, nombreArchivo);
}
