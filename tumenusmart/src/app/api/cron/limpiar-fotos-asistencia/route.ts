import { NextRequest, NextResponse } from "next/server";
import { limpiarFotosDeMarcaciones } from "@/lib/limpiar-fotos-asistencia";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Se corta antes del límite de la función para poder responder; lo que falte se hace en la próxima corrida.
const PRESUPUESTO_MS = 40000;

/**
 * Borra las fotos de las marcaciones de asistencia que ya pasaron de los días que se guardan (ver
 * DIAS_CONSERVAR_FOTOS_MARCACION). Corre todas las madrugadas. Las marcaciones quedan, sin foto.
 *
 * No atrapa los errores a propósito: si algo falla, el sistema de errores del servidor lo anota y te avisa, en
 * vez de que el borrado deje de andar sin que nadie se entere. Es idempotente: se puede repetir sin problema.
 */
export async function GET(request: NextRequest) {
  const noAutorizado = revisarClave(request);
  if (noAutorizado) return noAutorizado;

  const resultado = await limpiarFotosDeMarcaciones(new Date(), PRESUPUESTO_MS);

  console.log(
    `[limpiar-fotos-asistencia] borradas: ${resultado.fotosBorradas}, sin interpretar: ${resultado.sinRuta}, ` +
      `pendientes: ${resultado.quedanPendientes ? "sí" : "no"}`
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
