import { NextRequest, NextResponse } from "next/server";
import { sesionActual } from "@/lib/auth";
import { puede } from "@/lib/permisos";
import { idLocalActual, localActual } from "@/lib/local-actual";
import { listarCuentasPorPagar, type FiltroEstadoCuentas } from "@/lib/cuentas-por-pagar";
import {
  ETIQUETA_ESTADO_CUENTA,
  etiquetaFormaPago,
  textoVencimiento,
} from "@/lib/pagos-compra";
import { nuevoLibro, filaTitulo, respuestaXlsx } from "@/lib/excel-reporte";
import { claveDiaAsuncion } from "@/lib/timezone";

export const dynamic = "force-dynamic";

const ETIQUETA_FILTRO: Record<FiltroEstadoCuentas, string> = {
  con_saldo: "Con saldo pendiente",
  pagadas: "Ya pagadas",
  todas: "Todas",
};

/** dd/mm/aaaa de un día guardado como medianoche UTC (fecha de una factura, un vencimiento, un pago). */
function dia(fecha: Date): string {
  return fecha.toLocaleDateString("es-PY", { timeZone: "UTC" });
}

/**
 * Reporte de cuentas por pagar en Excel, con tres hojas: cada compra a crédito
 * (total, pagado, saldo, vencimiento y estado), lo que se le debe a cada
 * proveedor y el detalle de los pagos ya hechos. Cada dato va en su propia
 * columna para poder ordenar, filtrar o armar una tabla dinámica.
 *
 * Sale con el proveedor y el estado que se eligieron en la pantalla. Lo que se
 * debe (totales y hoja "Por proveedor") es siempre lo pendiente real, aunque
 * la lista sea de las ya pagadas.
 */
export async function GET(request: NextRequest) {
  // Ruta de API: no pasa por el layout del panel, así que valida la sesión y
  // el permiso por su cuenta.
  const sesion = await sesionActual();
  if (!sesion) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!puede(sesion.rol, "stock.ver")) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const estadoTexto = searchParams.get("estado");
  const estado: FiltroEstadoCuentas = estadoTexto === "pagadas" || estadoTexto === "todas" ? estadoTexto : "con_saldo";

  const storeId = await idLocalActual();
  const [local, cuentas] = await Promise.all([
    localActual(),
    listarCuentasPorPagar(storeId, { proveedorId: searchParams.get("proveedor") || null, estado }),
  ]);

  const hoy = claveDiaAsuncion(new Date());
  const cabeceraComun = (hoja: ReturnType<typeof nuevoLibro>["hoja"], titulo: string) => {
    // Encabezado fijo en todo reporte descargable: ver el mismo comentario en
    // envios/exportar/route.ts.
    filaTitulo(hoja, ["Negocio", local.nombre], 2);
    filaTitulo(hoja, ["Reporte", titulo], 2);
    filaTitulo(hoja, ["Al día", hoy], 2);
    filaTitulo(hoja, ["Proveedor", cuentas.proveedorFiltrado ?? "Todos"], 2);
    filaTitulo(hoja, ["Compras", ETIQUETA_FILTRO[cuentas.estadoFiltrado]], 2);
    hoja.addRow([]);
  };

  // ------------------------------------------------------------ cada compra a crédito
  const { libro, hoja } = nuevoLibro("Cuentas por pagar");
  hoja.columns = [
    { width: 28 },
    { width: 18 },
    { width: 22 },
    { width: 14 },
    { width: 16 },
    { width: 24 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
  ];
  cabeceraComun(hoja, "Cuentas por pagar");
  filaTitulo(
    hoja,
    [
      "Proveedor",
      "RUC",
      "Folio de la factura",
      "Fecha",
      "Vencimiento",
      "Situación del vencimiento",
      "Total (Gs.)",
      "Pagado (Gs.)",
      "Saldo (Gs.)",
      "Estado",
    ],
    10
  );
  let totalCompras = 0;
  let totalPagado = 0;
  let totalSaldo = 0;
  for (const f of cuentas.filas) {
    const fila = hoja.addRow([
      f.proveedor,
      f.proveedorRuc ?? "",
      f.folio ?? "",
      dia(f.fecha),
      f.vencimiento ? dia(f.vencimiento) : "",
      // Solo tiene sentido mientras se debe algo.
      f.saldo > 0 ? textoVencimiento(f.diasParaVencer) : "",
      Math.round(f.total),
      Math.round(f.pagado),
      Math.round(f.saldo),
      ETIQUETA_ESTADO_CUENTA[f.estado],
    ]);
    for (const col of [7, 8, 9]) fila.getCell(col).numFmt = "#,##0";
    totalCompras += f.total;
    totalPagado += f.pagado;
    totalSaldo += f.saldo;
  }
  const filaTotal = filaTitulo(
    hoja,
    ["TOTAL", "", "", "", "", "", Math.round(totalCompras), Math.round(totalPagado), Math.round(totalSaldo), ""],
    10
  );
  for (const col of [7, 8, 9]) filaTotal.getCell(col).numFmt = "#,##0";
  if (cuentas.filas.length === 0) {
    hoja.addRow([]);
    hoja.addRow(["No hay compras a crédito para este filtro."]);
  }
  hoja.addRow([]);
  hoja.addRow([
    "Los montos van con IVA incluido. Saldo = total de la compra menos lo pagado. Las compras canceladas no figuran.",
  ]);

  // ------------------------------------------------------------ lo que se debe a cada proveedor
  const resumen = libro.addWorksheet("Por proveedor");
  resumen.columns = [{ width: 32 }, { width: 22 }, { width: 20 }];
  cabeceraComun(resumen, "Cuentas por pagar — por proveedor (solo lo pendiente)");
  filaTitulo(resumen, ["Proveedor", "Compras con saldo", "Saldo (Gs.)"], 3);
  for (const p of cuentas.porProveedor) {
    const fila = resumen.addRow([p.proveedor, p.compras, Math.round(p.saldo)]);
    fila.getCell(3).numFmt = "#,##0";
  }
  const filaResumenTotal = filaTitulo(resumen, ["TOTAL QUE SE DEBE", "", Math.round(cuentas.totalSaldo)], 3);
  filaResumenTotal.getCell(3).numFmt = "#,##0";
  resumen.addRow([]);
  resumen.addRow(["De ese total, ya vencido (Gs.)", "", Math.round(cuentas.saldoVencido)]).getCell(3).numFmt = "#,##0";
  resumen
    .addRow(["De ese total, vence en los próximos 7 días (Gs.)", "", Math.round(cuentas.saldoPorVencer)])
    .getCell(3).numFmt = "#,##0";

  // ------------------------------------------------------------ pagos ya hechos
  const pagos = libro.addWorksheet("Pagos");
  pagos.columns = [{ width: 14 }, { width: 28 }, { width: 22 }, { width: 16 }, { width: 18 }, { width: 34 }, { width: 24 }];
  cabeceraComun(pagos, "Cuentas por pagar — pagos realizados");
  filaTitulo(pagos, ["Fecha del pago", "Proveedor", "Folio de la factura", "Monto (Gs.)", "Forma de pago", "Nota", "Registrado por"], 7);
  let totalPagos = 0;
  const todosLosPagos = cuentas.filas
    .flatMap((f) => f.pagos.map((p) => ({ f, p })))
    .sort((a, b) => a.p.fecha.getTime() - b.p.fecha.getTime());
  for (const { f, p } of todosLosPagos) {
    const fila = pagos.addRow([
      dia(p.fecha),
      f.proveedor,
      f.folio ?? "",
      Math.round(p.monto),
      etiquetaFormaPago(p.formaPago),
      p.notas ?? "",
      p.registradoPor ?? "",
    ]);
    fila.getCell(4).numFmt = "#,##0";
    totalPagos += p.monto;
  }
  const filaPagosTotal = filaTitulo(pagos, ["TOTAL PAGADO", "", "", Math.round(totalPagos), "", "", ""], 7);
  filaPagosTotal.getCell(4).numFmt = "#,##0";
  if (todosLosPagos.length === 0) {
    pagos.addRow([]);
    pagos.addRow(["Todavía no hay pagos registrados para este filtro."]);
  }

  return respuestaXlsx(libro, `cuentas_por_pagar_${hoy}.xlsx`);
}
