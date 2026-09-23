import { NextRequest, NextResponse } from "next/server";
import { sesionActual } from "@/lib/auth";
import { puede } from "@/lib/permisos";
import { idLocalActual, localActual } from "@/lib/local-actual";
import { calcularReporteCompras, rangoDeCompras, fechaDeCompra, diaEnTexto } from "@/lib/reporte-compras";
import { etiquetaIva } from "@/lib/iva";
import { nuevoLibro, filaTitulo, respuestaXlsx } from "@/lib/excel-reporte";

export const dynamic = "force-dynamic";

/**
 * Reporte de compras en Excel, con tres hojas: una fila por compra, una fila
 * por insumo comprado (el detalle) y el resumen por proveedor. En planilla
 * cada dato va en su propia columna (proveedor, folio, insumo...) para poder
 * ordenar, filtrar o armar una tabla dinámica sin deshacer nada a mano.
 */
export async function GET(request: NextRequest) {
  // Ruta de API: no pasa por el layout del panel, así que valida la sesión y
  // el permiso por su cuenta. Sin esto, cualquiera con una cookie inventada
  // se bajaba lo que le compra el negocio a cada proveedor.
  const sesion = await sesionActual();
  if (!sesion) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!puede(sesion.rol, "stock.ver")) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const rango = rangoDeCompras(searchParams.get("desde"), searchParams.get("hasta"));
  const proveedorId = searchParams.get("proveedor") || null;

  const storeId = await idLocalActual();
  const [local, reporte] = await Promise.all([localActual(), calcularReporteCompras(storeId, rango, proveedorId)]);

  const periodo = `${diaEnTexto(rango.desde)} - ${diaEnTexto(rango.hasta)}`;
  const cabeceraComun = (hoja: ReturnType<typeof nuevoLibro>["hoja"], titulo: string) => {
    // Encabezado fijo en todo reporte descargable: ver el mismo comentario en
    // envios/exportar/route.ts.
    filaTitulo(hoja, ["Negocio", local.nombre], 2);
    filaTitulo(hoja, ["Reporte", titulo], 2);
    filaTitulo(hoja, ["Período", periodo], 2);
    if (reporte.proveedorFiltrado) filaTitulo(hoja, ["Proveedor", reporte.proveedorFiltrado], 2);
    hoja.addRow([]);
  };

  // ------------------------------------------------------------ una fila por compra
  const { libro, hoja } = nuevoLibro("Compras");
  hoja.columns = [
    { width: 12 },
    { width: 28 },
    { width: 20 },
    { width: 12 },
    { width: 14 },
    { width: 16 },
    { width: 18 },
    { width: 14 },
    { width: 16 },
    { width: 36 },
  ];
  cabeceraComun(hoja, "Compras");
  filaTitulo(
    hoja,
    [
      "Fecha",
      "Proveedor",
      "Folio de factura",
      "Condición",
      "Vencimiento",
      "Subtotal (Gs.)",
      "Desc. general (Gs.)",
      "IVA (Gs.)",
      "Total (Gs.)",
      "Notas",
    ],
    10
  );
  for (const c of reporte.compras) {
    hoja.addRow([
      fechaDeCompra(c.fecha),
      c.proveedor,
      c.folio ?? "",
      c.condicionPago === "credito" ? "A crédito" : "Al contado",
      c.vencimiento ? fechaDeCompra(c.vencimiento) : "",
      Math.round(c.subtotal),
      Math.round(c.descuentoGeneral),
      Math.round(c.iva),
      Math.round(c.total),
      c.notas ?? "",
    ]);
  }
  filaTitulo(
    hoja,
    [
      "",
      `TOTAL (${reporte.totales.compras} ${reporte.totales.compras === 1 ? "compra" : "compras"})`,
      "",
      "",
      "",
      Math.round(reporte.totales.subtotal),
      Math.round(reporte.totales.descuentoGeneral),
      Math.round(reporte.totales.iva),
      Math.round(reporte.totales.total),
      "",
    ],
    10
  );
  hoja.addRow([]);
  hoja.addRow(["Al contado", "", "", "", "", "", "", "", Math.round(reporte.totales.contado)]);
  hoja.addRow(["A crédito", "", "", "", "", "", "", "", Math.round(reporte.totales.credito)]);
  hoja.addRow([]);
  hoja.addRow(["No incluye las compras canceladas."]);

  // ------------------------------------------------------------ una fila por insumo comprado
  const detalle = libro.addWorksheet("Detalle");
  detalle.columns = [
    { width: 12 },
    { width: 28 },
    { width: 20 },
    { width: 30 },
    { width: 20 },
    { width: 12 },
    { width: 12 },
    { width: 16 },
    { width: 18 },
    { width: 10 },
    { width: 14 },
    { width: 18 },
  ];
  cabeceraComun(detalle, "Compras — detalle por insumo");
  filaTitulo(
    detalle,
    [
      "Fecha",
      "Proveedor",
      "Folio de factura",
      "Insumo",
      "Almacén",
      "Cantidad comprada",
      "Trae c/u",
      "Entra al stock",
      "Costo unit. s/ IVA (Gs.)",
      "Desc. %",
      "IVA",
      "Importe s/ IVA (Gs.)",
    ],
    12
  );
  let importeTotal = 0;
  for (const c of reporte.compras) {
    for (const l of c.lineas) {
      importeTotal += l.importe;
      detalle.addRow([
        fechaDeCompra(c.fecha),
        c.proveedor,
        c.folio ?? "",
        l.insumo,
        l.almacen,
        l.cantidad,
        l.rendimiento,
        l.unidadesAlStock,
        Math.round(l.costoUnitario),
        l.descuentoPorcentaje ?? "",
        etiquetaIva(l.iva),
        Math.round(l.importe),
      ]);
    }
  }
  filaTitulo(detalle, ["", "TOTAL", "", "", "", "", "", "", "", "", "", Math.round(importeTotal)], 12);

  // ------------------------------------------------------------ resumen por proveedor
  const resumen = libro.addWorksheet("Por proveedor");
  resumen.columns = [{ width: 32 }, { width: 12 }, { width: 18 }, { width: 14 }, { width: 16 }];
  cabeceraComun(resumen, "Compras — por proveedor");
  filaTitulo(resumen, ["Proveedor", "Compras", "Neto (Gs.)", "IVA (Gs.)", "Total (Gs.)"], 5);
  for (const p of reporte.porProveedor) {
    resumen.addRow([p.proveedor, p.compras, Math.round(p.neto), Math.round(p.iva), Math.round(p.total)]);
  }
  filaTitulo(
    resumen,
    [
      "TOTAL",
      reporte.totales.compras,
      Math.round(reporte.totales.neto),
      Math.round(reporte.totales.iva),
      Math.round(reporte.totales.total),
    ],
    5
  );

  return respuestaXlsx(libro, `compras_${rango.desde}_a_${rango.hasta}.xlsx`);
}
