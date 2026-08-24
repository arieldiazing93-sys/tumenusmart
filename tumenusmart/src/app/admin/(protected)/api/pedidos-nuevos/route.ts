import { NextResponse } from "next/server";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { haySesionAdminValida } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Devuelve cuántos pedidos realmente enviados hay hasta ahora. El panel lo
 * consulta cada tantos segundos y, si el número subió, avisa con sonido.
 *
 * Se cuentan solo los enviados por WhatsApp a propósito: un pedido que el
 * cliente armó y abandonó no debería hacer sonar la campana de la cocina.
 *
 * El middleware solo mira que exista la cookie; acá se valida la firma de
 * verdad, porque una ruta de API no pasa por el layout del panel.
 */
export async function GET() {
  // Todas las consultas de acá abajo quedan atadas a este local.
  const prisma = prismaDelLocal(await idLocalActual());

  if (!(await haySesionAdminValida())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const [enviados, pendientes] = await Promise.all([
    prisma.order.count({ where: { enviadoWhatsapp: true } }),
    prisma.order.count({ where: { enviadoWhatsapp: true, estado: "pendiente" } }),
  ]);

  return NextResponse.json(
    { enviados, pendientes },
    { headers: { "Cache-Control": "no-store" } }
  );
}
