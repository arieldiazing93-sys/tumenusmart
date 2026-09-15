import ExcelJS from "exceljs";
import { NextResponse } from "next/server";

/**
 * Piezas comunes para armar los reportes descargables del panel como XLSX
 * de verdad (no CSV): así se le puede poner color de fondo a las filas de
 * título, algo que un CSV no puede llevar — el formato es texto plano, el
 * color lo decidía (o no) el programa que lo abría.
 */

/** Gris claro + negrita, para separar visualmente encabezados de sección y de columna del resto de las filas. */
const RELLENO_TITULO: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFF1F1F0" },
};

export function nuevoLibro(nombreHoja: string) {
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet(nombreHoja);
  return { libro, hoja };
}

/** Agrega una fila y le pinta el fondo de título a las primeras `columnas` celdas. */
export function filaTitulo(
  hoja: ExcelJS.Worksheet,
  valores: (string | number)[],
  columnas: number
) {
  const fila = hoja.addRow(valores);
  for (let i = 1; i <= columnas; i++) {
    const celda = fila.getCell(i);
    celda.fill = RELLENO_TITULO;
    celda.font = { bold: true };
  }
  return fila;
}

/** Arma la respuesta HTTP del archivo .xlsx ya generado. */
export async function respuestaXlsx(libro: ExcelJS.Workbook, nombreArchivo: string) {
  const buffer = await libro.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombreArchivo}"`,
    },
  });
}
