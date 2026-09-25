import { NextResponse } from "next/server";
import { exigirPermiso } from "@/lib/auth";
import { diaLargo, horaDeMinutos, partesLocales } from "@/lib/agenda";
import { nombreCompleto } from "@/lib/agenda-personal";
import { idLocalActual } from "@/lib/local-actual";
import { prismaDelLocal } from "@/lib/prisma-local";

export const dynamic = "force-dynamic";

/**
 * Hasta hace cuántos minutos se considera "nueva" una reserva. Una reserva de la web nace oculta y recién se ve cuando
 * el cliente toca "Enviar por WhatsApp" (unos minutos como mucho después de crearse), así que se mira cuándo se CREÓ y
 * con margen de sobra. Abrir el panel después de un rato no avisa de lo viejo.
 */
const VENTANA_MINUTOS = 15;

/**
 * Las reservas que entraron por la página pública hace un momento y ya se ven en el calendario, para que el panel
 * suene y avise sin recargar (ver AvisoReservasNuevas). Devuelve las últimas y es el panel quien recuerda cuáles ya
 * avisó: así no depende de contar ni de que nada se borre.
 *
 * Es una ruta de API: no pasa por el layout del panel, así que valida la sesión y el permiso por su cuenta.
 */
export async function GET() {
  try {
    await exigirPermiso("agenda.ver");
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const db = prismaDelLocal(await idLocalActual());
  const desde = new Date(Date.now() - VENTANA_MINUTOS * 60_000);

  const citas = await db.cita.findMany({
    where: {
      origen: "web",
      // Una reserva que todavía espera el aviso por WhatsApp no cuenta: el negocio aún no la ve.
      visible: true,
      createdAt: { gte: desde },
      estado: { notIn: ["cancelada", "no_asistio"] },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      clienteNombre: true,
      serviciosTexto: true,
      inicio: true,
      personal: { select: { nombre: true, apellido: true } },
    },
  });

  const reservas = citas.map((c) => {
    const { dia, minutos } = partesLocales(c.inicio);
    const hora = horaDeMinutos(minutos);
    return {
      id: c.id,
      cliente: c.clienteNombre,
      servicios: c.serviciosTexto,
      personal: nombreCompleto(c.personal),
      dia,
      hora,
      cuando: `${diaLargo(dia)} a las ${hora}`,
    };
  });

  return NextResponse.json({ reservas }, { headers: { "Cache-Control": "no-store" } });
}
