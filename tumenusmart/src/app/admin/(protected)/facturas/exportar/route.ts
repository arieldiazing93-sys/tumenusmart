import { NextRequest, NextResponse } from "next/server";
import { sesionActual } from "@/lib/auth";
import { puede } from "@/lib/permisos";
import { idLocalActual, localActual } from "@/lib/local-actual";
import { calcularRangoFecha, claveDia } from "@/lib/rango-fecha";
import { esVigente, etiquetaEstadoFactura, listarFacturas } from "@/lib/reporte-facturas";
import { nuevoLibro, filaTitulo, respuestaXlsx } from "@/lib/excel-reporte";
import { ZONA_NEGOCIO } from "@/lib/timezone";

export const dynamic = "force-dynamic";

/**
 * Reporte de facturas en Excel: una fila por factura con su cliente, el desglose
 * fiscal (gravado 10%, gravado 5%, exento, IVA), el total y su estado. Cada dato
 * va en su propia columna para poder ordenar, filtrar o armar una tabla dinámica.
 *
 * Es lo mismo que se ve en la pantalla de Facturas para el rango pedido, con las
 * anuladas incluidas (marcadas); los totales suman solo las vigentes.
 */
export async function GET(request: NextRequest) {
  // Ruta de API: no pasa por el layout del panel, así que valida la sesión y
  // el permiso por su cuenta.
  const sesion = await sesionActual();
  if (!sesion) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!puede(sesion.rol, "pos.verHistorico")) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const rango =
    calcularRangoFecha(searchParams.get("fecha") ?? "30dias", searchParams.get("desde") ?? undefined, searchParams.get("hasta") ?? undefined) ??
    calcularRangoFecha("30dias", undefined, undefined)!;

  const storeId = await idLocalActual();
  const [local, filas] = await Promise.all([localActual(), listarFacturas(storeId, rango)]);

  const opcionesFecha: Intl.DateTimeFormatOptions = {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: ZONA_NEGOCIO,
  };
  const finRangoInclusive = new Date(rango.lt.getTime() - 24 * 60 * 60 * 1000);
  const periodo = `${rango.gte.toLocaleDateString("es-PY", opcionesFecha)} - ${finRangoInclusive.toLocaleDateString("es-PY", opcionesFecha)}`;

  const { libro, hoja } = nuevoLibro("Facturas");
  hoja.columns = [
    { width: 18 },
    { width: 18 },
    { width: 30 },
    { width: 22 },
    { width: 18 },
    { width: 16 },
    { width: 16 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 16 },
    { width: 16 },
    { width: 34 },
  ];

  filaTitulo(hoja, ["Negocio", local.nombre], 2);
  filaTitulo(hoja, ["Reporte", "Facturas emitidas"], 2);
  filaTitulo(hoja, ["Período", periodo], 2);
  hoja.addRow([]);

  filaTitulo(
    hoja,
    [
      "N° Factura",
      "Fecha",
      "Cliente",
      "Tipo de identificación",
      "N° de identificación",
      "Origen",
      "Gravado 10% (Gs.)",
      "Gravado 5% (Gs.)",
      "Exento (Gs.)",
      "IVA 10% (Gs.)",
      "IVA 5% (Gs.)",
      "Total (Gs.)",
      "Estado",
      "Detalle",
    ],
    14
  );

  const montoOVacio = (n: number | null) => (n == null ? "" : Math.round(n));
  let totalGravado10 = 0;
  let totalGravado5 = 0;
  let totalExento = 0;
  let totalIva10 = 0;
  let totalIva5 = 0;
  let total = 0;
  let cantidadVigentes = 0;

  // De la más vieja a la más nueva: así se lee como un libro de ventas.
  for (const f of [...filas].reverse()) {
    const fila = hoja.addRow([
      f.facturaNumero,
      f.fecha.toLocaleString("es-PY", { ...opcionesFecha, hour: "2-digit", minute: "2-digit", hour12: false }),
      f.razonSocial,
      f.etiquetaIdentificacion,
      f.identificacion,
      f.origenLabel,
      montoOVacio(f.gravado10),
      montoOVacio(f.gravado5),
      montoOVacio(f.exento),
      montoOVacio(f.iva10),
      montoOVacio(f.iva5),
      Math.round(f.total),
      etiquetaEstadoFactura(f),
      f.reemplazadaPor
        ? `Reemplazada por la ${f.reemplazadaPor}${f.motivoAnulacion ? ` — ${f.motivoAnulacion}` : ""}`
        : "",
    ]);
    for (const col of [7, 8, 9, 10, 11, 12]) fila.getCell(col).numFmt = "#,##0";

    if (esVigente(f)) {
      cantidadVigentes += 1;
      totalGravado10 += f.gravado10 ?? 0;
      totalGravado5 += f.gravado5 ?? 0;
      totalExento += f.exento ?? 0;
      totalIva10 += f.iva10 ?? 0;
      totalIva5 += f.iva5 ?? 0;
      total += f.total;
    }
  }

  hoja.addRow([]);
  const filaTotal = filaTitulo(
    hoja,
    [
      `TOTAL VIGENTES (${cantidadVigentes})`,
      "",
      "",
      "",
      "",
      "",
      Math.round(totalGravado10),
      Math.round(totalGravado5),
      Math.round(totalExento),
      Math.round(totalIva10),
      Math.round(totalIva5),
      Math.round(total),
      "",
      "",
    ],
    14
  );
  for (const col of [7, 8, 9, 10, 11, 12]) filaTotal.getCell(col).numFmt = "#,##0";

  if (filas.length === 0) {
    hoja.addRow([]);
    hoja.addRow(["No hay facturas en este período."]);
  }
  hoja.addRow([]);
  hoja.addRow([
    "Los totales suman solo las facturas vigentes (no las anuladas ni las reemplazadas). Los montos van con IVA incluido; el IVA se saca dividiendo el gravado por 11 (10%) o por 21 (5%).",
  ]);

  const dia = (f: Date) => claveDia(f);
  return respuestaXlsx(libro, `facturas_${dia(rango.gte)}_a_${dia(finRangoInclusive)}.xlsx`);
}
