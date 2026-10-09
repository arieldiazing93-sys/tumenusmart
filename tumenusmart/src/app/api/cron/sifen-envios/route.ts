import { NextRequest, NextResponse } from "next/server";
import { procesarPendientes } from "@/lib/sifen/envio";

export const dynamic = "force-dynamic";
/** Cada documento es una llamada a la DNIT de hasta 30 segundos: se corta antes del límite y lo que falte se hace en la próxima corrida. */
export const maxDuration = 60;

/**
 * Envía a la DNIT las facturas electrónicas que están firmadas y todavía sin enviar (o con un problema de comunicación al que le
 * toca un reintento). La dispara Vercel cada minuto. Es segura de repetir: cada documento se reserva antes de enviarse, y un
 * documento ya aprobado o rechazado no se vuelve a tocar.
 *
 * No atrapa los errores a propósito: si algo se rompe, el sistema de errores del servidor lo anota y avisa, en vez de que los
 * envíos dejen de salir sin que nadie se entere.
 */
export async function GET(request: NextRequest) {
  const noAutorizado = revisarClave(request);
  if (noAutorizado) return noAutorizado;

  const resumen = await procesarPendientes({ limite: 10 });
  if (resumen.revisados > 0) {
    console.log(
      `[sifen-envios] revisados: ${resumen.revisados}, aprobados: ${resumen.aprobados}, rechazados: ${resumen.rechazados}, ` +
        `con problemas de comunicación: ${resumen.conProblemas}, omitidos: ${resumen.omitidos}`
    );
  }
  return NextResponse.json(resumen);
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
