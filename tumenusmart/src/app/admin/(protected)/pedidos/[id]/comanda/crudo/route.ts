import { NextRequest, NextResponse } from "next/server";
import { pantallaConPermiso } from "@/lib/auth";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { formatearNumero } from "@/lib/format";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import { armarDocumento, centrado, negrita, separador } from "@/lib/escpos";

export const dynamic = "force-dynamic";

/** Versión en texto plano (ESC/POS crudo) de la comanda de pedidos, para QZ Tray. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await pantallaConPermiso("pedidos.ver");
  const prisma = prismaDelLocal(await idLocalActual());
  const { id } = await params;
  const area = request.nextUrl.searchParams.get("area");

  const [pedido, areaImpresion] = await Promise.all([
    prisma.order.findUnique({
      where: { id },
      include: { items: { include: { product: { select: { areaImpresionId: true } } } }, deliveryZone: true },
    }),
    area ? prisma.areaImpresion.findUnique({ where: { id: area }, select: { nombre: true } }) : Promise.resolve(null),
  ]);
  if (!pedido) return new NextResponse("No encontrado", { status: 404 });

  const items = area ? pedido.items.filter((i) => i.product?.areaImpresionId === area) : pedido.items;
  const esDelivery = pedido.tipoEntrega === "delivery";

  const hora = new Date(pedido.createdAt).toLocaleString("es-PY", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: ZONA_NEGOCIO,
  });

  const l: string[] = [separador()];
  l.push(centrado(formatearNumero(pedido.numero)));
  if (areaImpresion) l.push(centrado(areaImpresion.nombre.toUpperCase()));
  l.push(separador());
  l.push(hora);
  l.push(esDelivery ? "DELIVERY" : pedido.tipoEntrega === "mesa" ? `MESA ${pedido.mesaNumero ?? "-"}` : "RETIRO");
  l.push(separador());

  for (const item of items) {
    l.push(`${item.cantidad} x ${item.nombreProducto}`.toUpperCase());
    if (item.opcionesTexto) l.push(`  + ${item.opcionesTexto}`);
    if (item.ingredientesQuitadosTexto) l.push(`  ${negrita(`** ${item.ingredientesQuitadosTexto} **`)}`);
  }

  if (pedido.notas) {
    l.push(separador());
    l.push("NOTA DEL CLIENTE");
    l.push(pedido.notas);
  }

  l.push(separador());
  l.push(centrado(`Cliente: ${pedido.clienteNombre}`));
  l.push(separador());

  return new NextResponse(armarDocumento(l), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
