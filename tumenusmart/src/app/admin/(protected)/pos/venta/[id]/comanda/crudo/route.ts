import { NextRequest, NextResponse } from "next/server";
import { pantallaConPermiso } from "@/lib/auth";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { formatearNumero } from "@/lib/format";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import { armarDocumento, centrado, separador } from "@/lib/escpos";

export const dynamic = "force-dynamic";

/** Versión en texto plano (ESC/POS crudo) de la comanda del POS, para QZ Tray. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await pantallaConPermiso("pos.vender");
  const db = prismaDelLocal(await idLocalActual());
  const { id } = await params;
  const area = request.nextUrl.searchParams.get("area");

  const [venta, areaImpresion] = await Promise.all([
    db.ventaPos.findUnique({
      where: { id },
      include: { items: { orderBy: { id: "asc" }, include: { product: { select: { areaImpresionId: true } } } } },
    }),
    area ? db.areaImpresion.findUnique({ where: { id: area }, select: { nombre: true } }) : Promise.resolve(null),
  ]);
  if (!venta) return new NextResponse("No encontrado", { status: 404 });

  const items = area ? venta.items.filter((i) => i.product?.areaImpresionId === area) : venta.items;

  const hora = venta.creadoEn.toLocaleString("es-PY", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: ZONA_NEGOCIO,
  });

  const l: string[] = [separador()];
  l.push(centrado(formatearNumero(venta.numero)));
  if (areaImpresion) l.push(centrado(areaImpresion.nombre.toUpperCase()));
  l.push(separador());
  l.push(hora);
  l.push(venta.tipoEntrega === "llevar" ? "PARA LLEVAR" : "EN EL LOCAL");
  l.push(separador());

  for (const item of items) {
    l.push(`${item.cantidad} x ${item.nombreProducto}`.toUpperCase());
    if (item.opcionesTexto) l.push(`  + ${item.opcionesTexto}`);
  }

  if (venta.nota) {
    l.push(separador());
    l.push("NOTA");
    l.push(venta.nota);
  }

  if (venta.clienteNombre) {
    l.push(separador());
    l.push(centrado(`Cliente: ${venta.clienteNombre}`));
  }

  l.push(separador());

  return new NextResponse(armarDocumento(l), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
