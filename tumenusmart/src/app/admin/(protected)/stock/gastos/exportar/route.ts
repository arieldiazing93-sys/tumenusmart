import { NextRequest, NextResponse } from "next/server";
import { sesionActual } from "@/lib/auth";
import { puede } from "@/lib/permisos";
import { idLocalActual, localActual } from "@/lib/local-actual";
import { rangoDeDias, fechaDeDia, diaEnTexto } from "@/lib/rango-dias";
import { calcularReporteGastos } from "@/lib/reporte-gastos";
import { nuevoLibro, filaTitulo, respuestaXlsx } from "@/lib/excel-reporte";

export const dynamic = "force-dynamic";

/**
 * Reporte de gastos en Excel, con dos hojas: una fila por gasto y el resumen
 * por categoría. En planilla cada dato va en su propia columna (fecha,
 * concepto, categoría, proveedor...) para poder ordenar, filtrar o armar una
 * tabla dinámica sin deshacer nada a mano.
 */
export async function GET(request: NextRequest) {
  // Ruta de API: no pasa por el layout del panel, así que valida la sesión y
  // el permiso por su cuenta. Sin esto, cualquiera con una cookie inventada
  // se bajaba todo lo que gasta el negocio.
  const sesion = await sesionActual();
  if (!sesion) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!puede(sesion.rol, "stock.ver")) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const rango = rangoDeDias(searchParams.get("desde"), searchParams.get("hasta"));

  const storeId = await idLocalActual();
  const [local, reporte] = await Promise.all([
    localActual(),
    calcularReporteGastos(storeId, rango, {
      categoria: searchParams.get("categoria"),
      proveedorId: searchParams.get("proveedor"),
    }),
  ]);

  const periodo = `${diaEnTexto(rango.desde)} - ${diaEnTexto(rango.hasta)}`;
  const cabeceraComun = (hoja: ReturnType<typeof nuevoLibro>["hoja"], titulo: string) => {
    // Encabezado fijo en todo reporte descargable: ver el mismo comentario en
    // envios/exportar/route.ts.
    filaTitulo(hoja, ["Negocio", local.nombre], 2);
    filaTitulo(hoja, ["Reporte", titulo], 2);
    filaTitulo(hoja, ["Período", periodo], 2);
    if (reporte.categoriaFiltrada) filaTitulo(hoja, ["Categoría", reporte.categoriaFiltrada], 2);
    if (reporte.proveedorFiltrado) filaTitulo(hoja, ["Proveedor", reporte.proveedorFiltrado], 2);
    hoja.addRow([]);
  };

  // ------------------------------------------------------------ una fila por gasto
  const { libro, hoja } = nuevoLibro("Gastos");
  hoja.columns = [{ width: 12 }, { width: 34 }, { width: 16 }, { width: 26 }, { width: 16 }, { width: 36 }, { width: 22 }];
  cabeceraComun(hoja, "Gastos");
  filaTitulo(hoja, ["Fecha", "Concepto", "Categoría", "Proveedor", "Monto (Gs.)", "Notas", "Registrado por"], 7);
  for (const g of reporte.gastos) {
    hoja.addRow([
      fechaDeDia(g.fecha),
      g.concepto,
      g.categoria,
      g.proveedor ?? "",
      Math.round(g.monto),
      g.notas ?? "",
      g.registradoPor ?? "",
    ]);
  }
  filaTitulo(
    hoja,
    [
      "",
      `TOTAL (${reporte.gastos.length} ${reporte.gastos.length === 1 ? "gasto" : "gastos"})`,
      "",
      "",
      Math.round(reporte.total),
      "",
      "",
    ],
    7
  );

  // ------------------------------------------------------------ resumen por categoría
  const resumen = libro.addWorksheet("Por categoría");
  resumen.columns = [{ width: 24 }, { width: 12 }, { width: 18 }, { width: 16 }];
  cabeceraComun(resumen, "Gastos — por categoría");
  filaTitulo(resumen, ["Categoría", "Gastos", "Total (Gs.)", "% del total"], 4);
  for (const c of reporte.porCategoria) {
    resumen.addRow([c.categoria, c.gastos, Math.round(c.total), Number(c.porcentaje.toFixed(1))]);
  }
  filaTitulo(resumen, ["TOTAL", reporte.gastos.length, Math.round(reporte.total), reporte.total > 0 ? 100 : 0], 4);

  return respuestaXlsx(libro, `gastos_${rango.desde}_a_${rango.hasta}.xlsx`);
}
