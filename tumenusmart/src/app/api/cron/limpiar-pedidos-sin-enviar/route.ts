import { NextRequest, NextResponse } from "next/server";
import { limpiarPedidosSinEnviarDeTodos } from "@/lib/pedidos-sin-enviar";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Se corta antes del límite de la función para poder responder; lo que falte se hace en la próxima corrida.
const PRESUPUESTO_MS = 40000;

/**
 * Cancela los pedidos de la carta digital que el cliente armó pero nunca mandó por WhatsApp dentro del tiempo que se le da
 * (ver MINUTOS_PARA_ENVIAR_PEDIDO): los borra y le devuelve el stock a los insumos. Corre cada pocos minutos, así el stock vuelve
 * aunque nadie entre a la pantalla del pedido ni al panel (esos dos también lo hacen al abrirse).
 *
 * No atrapa los errores a propósito: si algo falla, el sistema de errores del servidor lo anota y te avisa, en vez de que la
 * limpieza deje de andar sin que nadie se entere. Es idempotente: se puede repetir sin problema.
 */
export async function GET(request: NextRequest) {
  const noAutorizado = revisarClave(request);
  if (noAutorizado) return noAutorizado;

  const resultado = await limpiarPedidosSinEnviarDeTodos(new Date(), PRESUPUESTO_MS);

  console.log(
    `[limpiar-pedidos-sin-enviar] borrados: ${resultado.borrados}, pendientes: ${resultado.quedanPendientes ? "sí" : "no"}`
  );

  return NextResponse.json(resultado);
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
