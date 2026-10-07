import { NextResponse } from "next/server";
import { pantallaConPermiso } from "@/lib/auth";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { armarDocumento } from "@/lib/escpos";
import { cabeceraImpresoraFactura, copiasDeImpresion, impresoraParaFactura } from "@/lib/copias-impresion";
import { lineasDeFacturaDeCuenta } from "@/lib/factura-de-cuenta";

export const dynamic = "force-dynamic";

/**
 * La factura de una cuenta de delivery emitida con la "factura rápida" (antes de cobrar), en texto plano para la impresora (QZ Tray):
 * el mismo papel que la factura de una venta. `[id]` es el id de la CUENTA de delivery (todavía no hay venta). Una vez cobrada la cuenta,
 * la factura también sale por la venta; esta ruta sigue sirviendo mientras la factura esté vigente.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await pantallaConPermiso("pos.vender");
  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);
  const { id } = await params;

  const lineas = await lineasDeFacturaDeCuenta(db, storeId, id);
  if (!lineas) return new NextResponse("Esa cuenta no tiene una factura vigente.", { status: 404 });

  // Cuántas veces sale en la estación de quien lo pide (la factura tiene su propio contador; 0 = no se imprime) y en qué impresora.
  const copias = await copiasDeImpresion(db, { documento: "factura" });
  const impresoraFactura = await impresoraParaFactura(db);
  return new NextResponse(armarDocumento(lineas), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Copias": String(copias),
      ...cabeceraImpresoraFactura(impresoraFactura),
    },
  });
}
