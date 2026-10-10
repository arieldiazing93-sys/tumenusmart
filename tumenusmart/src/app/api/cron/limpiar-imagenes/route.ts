import { NextRequest, NextResponse } from "next/server";
import { limpiarImagenesHuerfanas } from "@/lib/limpiar-imagenes-huerfanas";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Se corta antes del límite de la función para poder responder; lo que falte se hace en la próxima corrida.
const PRESUPUESTO_MS = 40000;

/**
 * Borra del almacenamiento las imágenes que ninguna fila de la base usa y que tienen más de una semana (ver
 * `limpiarImagenesHuerfanas`). Corre todas las madrugadas. Con `?simular=1` solo cuenta y muestra qué borraría, sin tocar nada.
 *
 * No atrapa los errores a propósito: si algo falla, el sistema de errores del servidor lo anota y te avisa, en vez de que la
 * limpieza deje de andar sin que nadie se entere. Es idempotente: se puede repetir sin problema.
 */
export async function GET(request: NextRequest) {
  const noAutorizado = revisarClave(request);
  if (noAutorizado) return noAutorizado;

  const simular = request.nextUrl.searchParams.get("simular") === "1";
  const resultado = await limpiarImagenesHuerfanas(new Date(), PRESUPUESTO_MS, { simular });

  console.log(
    `[limpiar-imagenes] ${resultado.simulacion ? "SIMULACIÓN · " : ""}en almacenamiento: ${resultado.enAlmacenamiento}, en uso: ${resultado.enUso}, ` +
      `sueltas: ${resultado.sueltas}, borradas: ${resultado.borradas}, pendientes: ${resultado.quedanPendientes ? "sí" : "no"}` +
      (resultado.abortada ? `, ABORTADA: ${resultado.abortada}` : "")
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
