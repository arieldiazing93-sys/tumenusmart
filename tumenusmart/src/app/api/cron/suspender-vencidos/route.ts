import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import { estaVencido } from "@/lib/suscripcion";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Apaga los locales cuyo plazo se terminó.
 *
 * Corre todas las mañanas. No hay días de gracia: la fecha de vencimiento
 * significa "pagado hasta ese día inclusive", así que un local vencido el 30
 * atiende todo el 30 y esta tarea lo apaga al día siguiente.
 *
 * Lo que ve el cliente final es una pantalla neutra que nunca menciona pagos:
 * el problema es entre vos y el dueño, no algo que haya que exponerle a quien
 * quería pedir una pizza.
 *
 * Es idempotente: un local ya suspendido no se vuelve a tocar.
 */
export async function GET(request: NextRequest) {
  const noAutorizado = revisarClave(request);
  if (noAutorizado) return noAutorizado;

  const ahora = new Date();

  // Se traen los candidatos y la decisión final la toma la MISMA función que
  // usa la carta pública. Si acá se comparara la fecha a mano, con el tiempo
  // las dos reglas se irían separando y un local quedaría apagado en un lado
  // y abierto en el otro.
  const candidatos = await prisma.store.findMany({
    where: { estado: { not: "suspendido" }, vencimiento: { not: null } },
    select: { id: true, nombre: true, slug: true, vencimiento: true },
  });

  const aApagar = candidatos.filter((c) => estaVencido(c.vencimiento, ahora, ZONA_NEGOCIO));

  if (aApagar.length > 0) {
    await prisma.store.updateMany({
      where: { id: { in: aApagar.map((c) => c.id) } },
      data: { estado: "suspendido" },
    });
  }

  for (const local of aApagar) {
    console.log(`[suspender-vencidos] apagado: ${local.slug} (${local.nombre})`);
  }

  return NextResponse.json({
    revisados: candidatos.length,
    suspendidos: aApagar.length,
    locales: aApagar.map((l) => l.slug),
  });
}

function revisarClave(request: NextRequest): NextResponse | null {
  const esperado = process.env.CRON_SECRET;

  if (!esperado) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "Falta configurar CRON_SECRET" }, { status: 500 });
    }
    return null;
  }

  if (request.headers.get("authorization") === `Bearer ${esperado}`) return null;
  return NextResponse.json({ error: "No autorizado" }, { status: 401 });
}
