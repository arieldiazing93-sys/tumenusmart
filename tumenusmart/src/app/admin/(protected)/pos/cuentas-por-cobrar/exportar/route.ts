import { NextRequest, NextResponse } from "next/server";
import { sesionActual } from "@/lib/auth";
import { puede } from "@/lib/permisos";
import { idLocalActual, localActual } from "@/lib/local-actual";
import { listarCuentasPorCobrar, type FiltroEstadoCobros } from "@/lib/cuentas-por-cobrar";
import { ETIQUETA_ESTADO_CUENTA, textoVencimiento } from "@/lib/pagos-compra";
import { etiquetaFormaPagoPos } from "@/lib/turno-pos";
import { formatearNumero } from "@/lib/format";
import { nuevoLibro, filaTitulo, respuestaXlsx } from "@/lib/excel-reporte";
import { claveDiaAsuncion, ZONA_NEGOCIO } from "@/lib/timezone";

export const dynamic = "force-dynamic";

const ETIQUETA_FILTRO: Record<FiltroEstadoCobros, string> = {
  con_saldo: "Con saldo pendiente",
  cobradas: "Ya cobradas",
  todas: "Todas",
};

/** dd/mm/aaaa de un día guardado como medianoche UTC (un vencimiento, la fecha de un cobro). */
function diaUtc(fecha: Date): string {
  return fecha.toLocaleDateString("es-PY", { timeZone: "UTC" });
}

/** dd/mm/aaaa de un instante (la venta), en el día de Asunción. */
function diaAsuncion(fecha: Date): string {
  return fecha.toLocaleDateString("es-PY", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: ZONA_NEGOCIO });
}

/**
 * Reporte de cuentas por cobrar en Excel, con tres hojas: cada venta a crédito
 * (total, cobrado, saldo, vencimiento y estado), lo que debe cada cliente y el
 * detalle de los cobros ya hechos. Cada dato va en su propia columna para poder
 * ordenar, filtrar o armar una tabla dinámica.
 *
 * Sale con el cliente buscado y el estado que se eligieron en la pantalla. Lo
 * que se debe (totales y hoja "Por cliente") es siempre lo pendiente real,
 * aunque la lista sea de las ya cobradas.
 */
export async function GET(request: NextRequest) {
  // Ruta de API: no pasa por el layout del panel, así que valida la sesión y
  // el permiso por su cuenta.
  const sesion = await sesionActual();
  if (!sesion) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!puede(sesion.rol, "pos.vender")) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const estadoTexto = searchParams.get("estado");
  const estado: FiltroEstadoCobros = estadoTexto === "cobradas" || estadoTexto === "todas" ? estadoTexto : "con_saldo";

  const storeId = await idLocalActual();
  const [local, cuentas] = await Promise.all([
    localActual(),
    listarCuentasPorCobrar(storeId, { texto: searchParams.get("q"), estado }),
  ]);

  const hoy = claveDiaAsuncion(new Date());
  const cabeceraComun = (hoja: ReturnType<typeof nuevoLibro>["hoja"], titulo: string) => {
    // Encabezado fijo en todo reporte descargable: ver el mismo comentario en
    // envios/exportar/route.ts.
    filaTitulo(hoja, ["Negocio", local.nombre], 2);
    filaTitulo(hoja, ["Reporte", titulo], 2);
    filaTitulo(hoja, ["Al día", hoy], 2);
    filaTitulo(hoja, ["Cliente", cuentas.textoFiltrado ?? "Todos"], 2);
    filaTitulo(hoja, ["Ventas", ETIQUETA_FILTRO[cuentas.estadoFiltrado]], 2);
    hoja.addRow([]);
  };

  // ------------------------------------------------------------ cada venta a crédito
  const { libro, hoja } = nuevoLibro("Cuentas por cobrar");
  hoja.columns = [
    { width: 10 },
    { width: 18 },
    { width: 12 },
    { width: 30 },
    { width: 16 },
    { width: 16 },
    { width: 14 },
    { width: 24 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
  ];
  cabeceraComun(hoja, "Cuentas por cobrar");
  filaTitulo(
    hoja,
    [
      "Venta",
      "Factura",
      "Fecha",
      "Cliente",
      "RUC o cédula",
      "Teléfono",
      "Vencimiento",
      "Situación del vencimiento",
      "Total (Gs.)",
      "Cobrado (Gs.)",
      "Saldo (Gs.)",
      "Estado",
    ],
    12
  );
  let totalVentas = 0;
  let totalCobrado = 0;
  let totalSaldo = 0;
  for (const f of cuentas.filas) {
    const fila = hoja.addRow([
      formatearNumero(f.numero),
      f.facturaNumero ?? "",
      diaAsuncion(f.fecha),
      f.cliente,
      f.identificacion ?? "",
      f.telefono ?? "",
      f.vencimiento ? diaUtc(f.vencimiento) : "",
      // Solo tiene sentido mientras se debe algo.
      f.saldo > 0 ? textoVencimiento(f.diasParaVencer) : "",
      Math.round(f.total),
      Math.round(f.cobrado),
      Math.round(f.saldo),
      f.estado === "pagada" ? "Cobrada" : ETIQUETA_ESTADO_CUENTA[f.estado],
    ]);
    for (const col of [9, 10, 11]) fila.getCell(col).numFmt = "#,##0";
    totalVentas += f.total;
    totalCobrado += f.cobrado;
    totalSaldo += f.saldo;
  }
  const filaTotal = filaTitulo(
    hoja,
    ["TOTAL", "", "", "", "", "", "", "", Math.round(totalVentas), Math.round(totalCobrado), Math.round(totalSaldo), ""],
    12
  );
  for (const col of [9, 10, 11]) filaTotal.getCell(col).numFmt = "#,##0";
  if (cuentas.filas.length === 0) {
    hoja.addRow([]);
    hoja.addRow(["No hay ventas a crédito para este filtro."]);
  }
  hoja.addRow([]);
  hoja.addRow([
    "Los montos van con IVA incluido. Saldo = total de la venta menos lo cobrado. Las ventas canceladas no figuran.",
  ]);

  // ------------------------------------------------------------ lo que debe cada cliente
  const resumen = libro.addWorksheet("Por cliente");
  resumen.columns = [{ width: 32 }, { width: 18 }, { width: 20 }, { width: 20 }];
  cabeceraComun(resumen, "Cuentas por cobrar — por cliente (solo lo pendiente)");
  filaTitulo(resumen, ["Cliente", "Teléfono", "Ventas con saldo", "Saldo (Gs.)"], 4);
  for (const c of cuentas.porCliente) {
    const fila = resumen.addRow([c.cliente, c.telefono ?? "", c.ventas, Math.round(c.saldo)]);
    fila.getCell(4).numFmt = "#,##0";
  }
  const filaResumenTotal = filaTitulo(resumen, ["TOTAL QUE SE DEBE", "", "", Math.round(cuentas.totalSaldo)], 4);
  filaResumenTotal.getCell(4).numFmt = "#,##0";
  resumen.addRow([]);
  resumen.addRow(["De ese total, ya vencido (Gs.)", "", "", Math.round(cuentas.saldoVencido)]).getCell(4).numFmt = "#,##0";
  resumen
    .addRow(["De ese total, vence en los próximos 7 días (Gs.)", "", "", Math.round(cuentas.saldoPorVencer)])
    .getCell(4).numFmt = "#,##0";

  // ------------------------------------------------------------ cobros ya hechos
  const cobros = libro.addWorksheet("Cobros");
  cobros.columns = [{ width: 14 }, { width: 10 }, { width: 30 }, { width: 16 }, { width: 18 }, { width: 34 }, { width: 24 }];
  cabeceraComun(cobros, "Cuentas por cobrar — cobros realizados");
  filaTitulo(cobros, ["Fecha del cobro", "Venta", "Cliente", "Monto (Gs.)", "Forma de pago", "Nota", "Registrado por"], 7);
  let totalCobros = 0;
  const todosLosCobros = cuentas.filas
    .flatMap((f) => f.cobros.map((c) => ({ f, c })))
    .sort((a, b) => a.c.fecha.getTime() - b.c.fecha.getTime());
  for (const { f, c } of todosLosCobros) {
    const fila = cobros.addRow([
      diaUtc(c.fecha),
      formatearNumero(f.numero),
      f.cliente,
      Math.round(c.monto),
      etiquetaFormaPagoPos(c.formaPago),
      c.notas ?? "",
      c.registradoPor,
    ]);
    fila.getCell(4).numFmt = "#,##0";
    totalCobros += c.monto;
  }
  const filaCobrosTotal = filaTitulo(cobros, ["TOTAL COBRADO", "", "", Math.round(totalCobros), "", "", ""], 7);
  filaCobrosTotal.getCell(4).numFmt = "#,##0";
  if (todosLosCobros.length === 0) {
    cobros.addRow([]);
    cobros.addRow(["Todavía no hay cobros registrados para este filtro."]);
  }

  return respuestaXlsx(libro, `cuentas_por_cobrar_${hoy}.xlsx`);
}
