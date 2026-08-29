import { NextResponse } from "next/server";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { haySesionAdminValida } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Cuántos pedidos hay, para que el panel se entere sin recargar.
 *
 * Devuelve DOS números distintos porque hacen dos cosas distintas, y antes
 * había uno solo haciendo las dos mal:
 *
 *   enviados -> los que el cliente mandó por WhatsApp. Este hace sonar la
 *               campana. Sigue contando solo los enviados a propósito: si
 *               sonara con cada carrito abandonado, en una semana la cocina
 *               aprende a ignorar el sonido y deja de servir para algo.
 *
 *   total    -> todos, enviados o no. Este solo refresca la tabla, en
 *               silencio. Un pedido que quedó "sin enviar" TIENE que
 *               aparecer: es alguien que llegó hasta el final y se trabó, y
 *               el local puede levantar el teléfono y rescatarlo.
 *
 * Antes el sonido y el refresco compartían el mismo número, así que la
 * decisión correcta para la campana ("no suenes por un carrito abandonado")
 * arrastraba sin querer a la tabla, que se quedaba quieta hasta que alguien
 * recargaba a mano.
 *
 * El middleware solo mira que exista la cookie; acá se valida la firma de
 * verdad, porque una ruta de API no pasa por el layout del panel.
 */
export async function GET() {
  // La sesión se verifica ANTES de tocar la base: así, sin sesión, la
  // respuesta es un 401 limpio y no un error de servidor.
  if (!(await haySesionAdminValida())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  // Todas las consultas de acá abajo quedan atadas a este local.
  const prisma = prismaDelLocal(await idLocalActual());

  const [enviados, pendientes, total] = await Promise.all([
    prisma.order.count({ where: { enviadoWhatsapp: true } }),
    prisma.order.count({ where: { enviadoWhatsapp: true, estado: "pendiente" } }),
    prisma.order.count(),
  ]);

  return NextResponse.json(
    { enviados, pendientes, total },
    { headers: { "Cache-Control": "no-store" } }
  );
}
