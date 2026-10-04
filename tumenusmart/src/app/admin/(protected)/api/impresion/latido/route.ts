import { NextResponse } from "next/server";
import { sesionActual } from "@/lib/auth";
import { puede } from "@/lib/permisos";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { estacionActual } from "@/lib/estacion-actual";

export const dynamic = "force-dynamic";

/**
 * Solo avisa "esta estación sigue imprimiendo": renueva el latido que ve el mozo en su celular. La estación lo manda mientras
 * tiene una impresión en curso (que puede tardar, o quedar trabada en una impresora en pausa), porque durante ese rato no
 * hace su consulta normal de comandas (`reclamar`, que también renueva el latido). Sin esto, una sola impresión lenta le
 * hacía creer al mozo que nadie estaba imprimiendo.
 *
 * Una ruta de API no pasa por el layout del panel: valida la sesión y el permiso antes de tocar la base.
 */
export async function POST() {
  const sesion = await sesionActual();
  if (!sesion) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!puede(sesion.rol, "comedor.gestionar")) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });

  // Todas las consultas de acá abajo quedan atadas a este local.
  const db = prismaDelLocal(await idLocalActual());
  const estacion = await estacionActual(db);
  if (!estacion) {
    return NextResponse.json({ ok: false, motivo: "sin_estacion" }, { headers: { "Cache-Control": "no-store" } });
  }

  await db.estacion.updateMany({ where: { id: estacion.id }, data: { impresionVistaEn: new Date() } });
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
