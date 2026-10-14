import { NextRequest, NextResponse } from "next/server";
import { sesionActual } from "@/lib/auth";
import { puede } from "@/lib/permisos";
import { idLocalActual, localActual } from "@/lib/local-actual";
import { calcularRangoFecha } from "@/lib/rango-fecha";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import { fechaDelLibro, leerReporteContable, resumirIva, totalizar, REPORTES_CONTABLES } from "@/lib/libro-iva";
import { cargarLibroCompras, cargarLibroVentas } from "@/lib/libro-iva-servidor";
import { nuevoLibro, filaTitulo, respuestaXlsx } from "@/lib/excel-reporte";

export const dynamic = "force-dynamic";

/** El Excel del Libro IVA ventas, del Libro IVA compras o del Resumen del IVA del período (mismas columnas que el libro oficial). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ reporte: string }> }) {
  // Una ruta de API no pasa por el layout del panel: valida la sesión Y el permiso por su cuenta, antes de tocar la base.
  const sesion = await sesionActual();
  if (!sesion) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { reporte: reporteCrudo } = await params;
  const reporte = leerReporteContable(reporteCrudo);
  if (!reporte || reporte === "rg90") return NextResponse.json({ error: "Reporte no encontrado" }, { status: 404 });
  if (!puede(sesion.rol, "pos.verHistorico")) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  if (reporte !== "libro-ventas" && !puede(sesion.rol, "stock.ver")) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const fecha = searchParams.get("fecha") ?? "mesAnterior";
  const rango =
    calcularRangoFecha(fecha, searchParams.get("desde") ?? undefined, searchParams.get("hasta") ?? undefined) ??
    calcularRangoFecha("mesAnterior", undefined, undefined)!;
  const finRangoInclusive = new Date(rango.lt.getTime() - 24 * 60 * 60 * 1000);
  const periodo = `${fechaDelLibro(rango.gte, ZONA_NEGOCIO)} - ${fechaDelLibro(finRangoInclusive, ZONA_NEGOCIO)}`;
  const info = REPORTES_CONTABLES.find((r) => r.valor === reporte)!;

  const storeId = await idLocalActual();
  const necesitaVentas = reporte === "libro-ventas" || reporte === "resumen-iva";
  const necesitaCompras = reporte === "libro-compras" || reporte === "resumen-iva";
  const [local, ventas, compras] = await Promise.all([
    localActual(),
    necesitaVentas ? cargarLibroVentas(storeId, rango) : Promise.resolve({ filas: [], anuladas: 0 }),
    necesitaCompras ? cargarLibroCompras(storeId, rango) : Promise.resolve({ filas: [], sinComprobante: 0 }),
  ]);

  const { libro, hoja } = nuevoLibro(info.titulo.slice(0, 31));

  if (reporte === "libro-ventas") {
    hoja.columns = [
      { width: 22 }, { width: 18 }, { width: 34 }, { width: 14 }, { width: 11 }, { width: 18 }, { width: 14 }, { width: 14 },
      { width: 11 }, { width: 16 }, { width: 14 }, { width: 18 }, { width: 14 }, { width: 18 }, { width: 14 }, { width: 16 },
    ];
    filaTitulo(hoja, ["LIBRO DE VENTAS E INGRESOS (IVA)"], 1);
    filaTitulo(hoja, ["Negocio", local.nombre], 2);
    filaTitulo(hoja, ["Período", periodo], 2);
    hoja.addRow([]);
    const encabezado = [
      "Tipo identificación", "RUC / Identificación", "Nombre / Razón social", "Tipo comprobante", "Timbrado", "Número de comprobante",
      "Fecha de emisión", "Modalidad", "Condición", "Importe total", "Importe exenta", "Total gravadas 5% (IVA incl.)", "IVA 5%",
      "Total gravadas 10% (IVA incl.)", "IVA 10%", "Total importe sin IVA",
    ];
    filaTitulo(hoja, encabezado, encabezado.length);
    for (const f of ventas.filas) {
      hoja.addRow([
        f.tipoIdentificacion, f.identificacion, f.razonSocial, "Factura", f.timbrado, f.numero, fechaDelLibro(f.fecha, ZONA_NEGOCIO),
        f.modalidad === "electronico" ? "Electrónica" : "Autoimpresor", f.condicion === "credito" ? "Crédito" : "Contado",
        f.total, f.exento, f.gravado5, f.iva5, f.gravado10, f.iva10, f.sinIva,
      ]);
    }
    const t = totalizar(ventas.filas);
    filaTitulo(hoja, ["TOTAL", "", "", "", "", "", "", "", "", t.total, t.exento, t.gravado5, t.iva5, t.gravado10, t.iva10, t.sinIva], encabezado.length);
    if (ventas.anuladas > 0) {
      hoja.addRow([]);
      hoja.addRow([`Facturas anuladas en el período: ${ventas.anuladas} (no suman al libro).`]);
    }
  } else if (reporte === "libro-compras") {
    hoja.columns = [
      { width: 22 }, { width: 18 }, { width: 34 }, { width: 14 }, { width: 11 }, { width: 18 }, { width: 14 }, { width: 11 },
      { width: 16 }, { width: 14 }, { width: 18 }, { width: 14 }, { width: 18 }, { width: 14 }, { width: 16 }, { width: 40 },
    ];
    filaTitulo(hoja, ["LIBRO DE COMPRAS Y EGRESOS (IVA)"], 1);
    filaTitulo(hoja, ["Negocio", local.nombre], 2);
    filaTitulo(hoja, ["Período", periodo], 2);
    hoja.addRow([]);
    const encabezado = [
      "Tipo identificación", "RUC / Identificación", "Nombre / Razón social del proveedor", "Tipo comprobante", "Timbrado",
      "Número de comprobante", "Fecha de emisión", "Origen", "Condición", "Importe total", "Importe exenta",
      "Total gravadas 5% (IVA incl.)", "IVA 5%", "Total gravadas 10% (IVA incl.)", "IVA 10%", "Observación",
    ];
    // Al final de cada fila va qué le falta a un comprobante incompleto (no suma como crédito fiscal).
    filaTitulo(hoja, encabezado, encabezado.length);
    for (const f of compras.filas) {
      hoja.addRow([
        f.tipoIdentificacion, f.identificacion, f.razonSocial, "Factura", f.timbrado, f.numero, fechaDelLibro(f.fecha, "UTC"),
        f.origen === "gasto" ? "Gasto" : "Compra", f.condicion === "credito" ? "Crédito" : "Contado",
        f.total, f.exento, f.gravado5, f.iva5, f.gravado10, f.iva10,
        f.faltan.length > 0 ? `Incompleta: falta ${f.faltan.join(", ")} (no suma como crédito fiscal)` : "",
      ]);
    }
    const completas = compras.filas.filter((f) => f.faltan.length === 0);
    const t = totalizar(completas);
    filaTitulo(
      hoja,
      ["TOTAL (solo comprobantes completos)", "", "", "", "", "", "", "", "", t.total, t.exento, t.gravado5, t.iva5, t.gravado10, t.iva10, ""],
      encabezado.length
    );
    if (compras.sinComprobante > 0) {
      hoja.addRow([]);
      hoja.addRow([`Compras o gastos sin factura del proveedor: ${compras.sinComprobante} (no entran al libro).`]);
    }
  } else {
    hoja.columns = [{ width: 40 }, { width: 24 }, { width: 18 }];
    const r = resumirIva(ventas.filas, compras.filas, ventas.anuladas, compras.sinComprobante);
    filaTitulo(hoja, ["RESUMEN DEL IVA"], 1);
    filaTitulo(hoja, ["Negocio", local.nombre], 2);
    filaTitulo(hoja, ["Período", periodo], 2);
    hoja.addRow([]);
    filaTitulo(hoja, ["Ventas (débito fiscal)", "Importe con IVA (Gs.)", "IVA (Gs.)"], 3);
    hoja.addRow(["Gravadas al 10 %", r.ventas.gravado10, r.ventas.iva10]);
    hoja.addRow(["Gravadas al 5 %", r.ventas.gravado5, r.ventas.iva5]);
    hoja.addRow(["Exentas", r.ventas.exento, ""]);
    filaTitulo(hoja, ["Total de ventas", r.ventas.total, r.debitoFiscal], 3);
    hoja.addRow([]);
    filaTitulo(hoja, ["Compras (crédito fiscal)", "Importe con IVA (Gs.)", "IVA (Gs.)"], 3);
    hoja.addRow(["Gravadas al 10 %", r.compras.gravado10, r.compras.iva10]);
    hoja.addRow(["Gravadas al 5 %", r.compras.gravado5, r.compras.iva5]);
    hoja.addRow(["Exentas", r.compras.exento, ""]);
    filaTitulo(hoja, ["Total de compras", r.compras.total, r.creditoFiscal], 3);
    hoja.addRow([]);
    filaTitulo(hoja, ["IVA del período", "", ""], 3);
    hoja.addRow(["IVA de las ventas (débito)", "", r.debitoFiscal]);
    hoja.addRow(["IVA de las compras (crédito)", "", r.creditoFiscal]);
    filaTitulo(hoja, [r.saldo > 0 ? "IVA a pagar (referencia)" : "Saldo a favor (referencia)", "", Math.abs(r.saldo)], 3);
    hoja.addRow([]);
    hoja.addRow([`Facturas de ventas: ${r.ventas.comprobantes} · anuladas: ${r.facturasAnuladas}`]);
    hoja.addRow([`Compras con factura completa: ${r.compras.comprobantes} · incompletas: ${r.comprasIncompletas.comprobantes} · sin factura: ${r.comprasSinComprobante}`]);
    hoja.addRow(["Es una referencia: la declaración oficial del IVA la liquida Marangatú con el registro RG 90 confirmado."]);
  }

  return respuestaXlsx(libro, `${reporte}_${fecha}.xlsx`);
}
