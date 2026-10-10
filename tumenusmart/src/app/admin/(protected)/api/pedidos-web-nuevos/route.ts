import { NextResponse } from "next/server";
import { exigirPermiso } from "@/lib/auth";
import { idLocalActual } from "@/lib/local-actual";
import { prismaDelLocal } from "@/lib/prisma-local";

export const dynamic = "force-dynamic";

/**
 * Los pedidos del menú digital que esperan una decisión (nuevos), para que el panel suene y avise desde cualquier pantalla sin
 * recargar (ver AvisoPedidosWeb). Devuelve los más recientes y la cantidad total; es el panel quien recuerda cuáles ya avisó.
 *
 * Es una ruta de API: no pasa por el layout del panel, así que valida la sesión y el permiso por su cuenta.
 */
export async function GET() {
  try {
    await exigirPermiso("delivery.ver");
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const db = prismaDelLocal(await idLocalActual());
  const [filas, pendientes] = await Promise.all([
    db.pedidoWeb.findMany({
      where: { estado: "nuevo" },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, numero: true, clienteNombre: true, total: true, tipoEntrega: true, createdAt: true },
    }),
    db.pedidoWeb.count({ where: { estado: "nuevo" } }),
  ]);

  return NextResponse.json(
    {
      pendientes,
      pedidos: filas.map((p) => ({
        id: p.id,
        numero: p.numero,
        cliente: p.clienteNombre,
        total: Number(p.total),
        tipoEntrega: p.tipoEntrega,
        creadoEn: p.createdAt.toISOString(),
      })),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
