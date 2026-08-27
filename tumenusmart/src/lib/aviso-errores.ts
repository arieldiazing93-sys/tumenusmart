import { prisma } from "./prisma";
import {
  asuntoDelAviso,
  decidirAviso,
  huellaDeError,
  recortar,
  HORAS_ENTRE_AVISOS,
} from "./errores";

/**
 * Registrar un error y, si corresponde, avisar por correo.
 *
 * Esta función NUNCA puede lanzar. La llama el enganche de errores de Next:
 * si fallara, un error del sistema provocaría otro error, y el segundo taparía
 * al primero — que es justamente el que hay que ver.
 *
 * El correo se manda con una llamada HTTP directa, sin librería. No es
 * cabezonería: en este proyecto no se pueden instalar paquetes para probarlos,
 * así que todo lo que entra tiene que ser código que yo pueda verificar.
 */
export async function registrarError(datos: {
  mensaje: string;
  detalle?: string;
  ruta: string;
  storeId?: string | null;
  nombreLocal?: string | null;
  usuario?: string | null;
}): Promise<void> {
  try {
    const huella = huellaDeError(datos.mensaje, datos.ruta);
    const ahora = new Date();

    // Una fila por problema: si ya existe, suma una ocurrencia. Y si estaba
    // marcado como resuelto, se desmarca solo — volvió a pasar.
    const fila = await prisma.errorReportado.upsert({
      where: { huella },
      create: {
        huella,
        ruta: datos.ruta,
        mensaje: recortar(datos.mensaje, 500),
        detalle: datos.detalle ? recortar(datos.detalle) : null,
        storeId: datos.storeId ?? null,
        nombreLocal: datos.nombreLocal ?? null,
        usuario: datos.usuario ?? null,
      },
      update: {
        ocurrencias: { increment: 1 },
        ultimaVez: ahora,
        resuelto: false,
        detalle: datos.detalle ? recortar(datos.detalle) : undefined,
      },
    });

    const inicioDelDia = new Date(ahora);
    inicioDelDia.setUTCHours(0, 0, 0, 0);
    const avisosHoy = await prisma.errorReportado.count({
      where: { avisadoEn: { gte: inicioDelDia } },
    });

    const decision = decidirAviso(
      { ultimoAvisoEn: fila.avisadoEn, avisosHoy },
      ahora
    );
    if (!decision.avisar) return;

    const enviado = await enviarCorreo({
      asunto: asuntoDelAviso(fila.nombreLocal, fila.ruta),
      cuerpo: armarCuerpo({ ...fila, ocurrencias: fila.ocurrencias }),
    });

    // Solo se marca como avisado si el correo salió. Si el servicio de correo
    // estaba caído, el próximo error del mismo tipo vuelve a intentar.
    if (enviado) {
      await prisma.errorReportado.update({
        where: { id: fila.id },
        data: { avisadoEn: ahora },
      });
    }
  } catch {
    // A propósito en silencio. Un fallo acá no puede romper la pantalla del
    // cliente ni ocultar el error original.
  }
}

function armarCuerpo(fila: {
  mensaje: string;
  ruta: string;
  nombreLocal: string | null;
  usuario: string | null;
  detalle: string | null;
  ocurrencias: number;
  primeraVez: Date;
}): string {
  const lineas = [
    fila.mensaje,
    "",
    `Pantalla:  ${fila.ruta}`,
    `Local:     ${fila.nombreLocal ?? "—"}`,
    `Usuario:   ${fila.usuario ?? "—"}`,
    `Veces:     ${fila.ocurrencias}${fila.ocurrencias > 1 ? ` (desde ${fila.primeraVez.toISOString()})` : ""}`,
    "",
    `No vas a recibir otro correo por este mismo problema durante ${HORAS_ENTRE_AVISOS} horas.`,
    "Podés ver todos los errores en /admin/errores.",
  ];
  if (fila.detalle) lineas.push("", "─".repeat(40), fila.detalle);
  return lineas.join("\n");
}

/**
 * Manda el correo. Devuelve si salió.
 *
 * Sin las variables de entorno configuradas no hace nada y no se queja: así
 * el sistema funciona igual en desarrollo y mientras no esté dada de alta la
 * cuenta de correo. El error igual queda registrado en la tabla.
 */
async function enviarCorreo(datos: { asunto: string; cuerpo: string }): Promise<boolean> {
  const clave = process.env.RESEND_API_KEY;
  const destino = process.env.AVISOS_EMAIL_DESTINO;
  if (!clave || !destino) return false;

  // El remitente sale de una variable para no atarse a un dominio: mientras no
  // haya uno verificado sirve onboarding@resend.dev, que solo puede escribirle
  // a la casilla con la que se creó la cuenta — que es exactamente el caso.
  const remitente = process.env.AVISOS_EMAIL_REMITENTE ?? "onboarding@resend.dev";

  try {
    const respuesta = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${clave}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `TuMenuSmart <${remitente}>`,
        to: [destino],
        subject: datos.asunto,
        text: datos.cuerpo,
      }),
      // Si el servicio de correo se cuelga, no puede colgar la pantalla del
      // cliente: a los 5 segundos se abandona.
      signal: AbortSignal.timeout(5000),
    });
    return respuesta.ok;
  } catch {
    return false;
  }
}
