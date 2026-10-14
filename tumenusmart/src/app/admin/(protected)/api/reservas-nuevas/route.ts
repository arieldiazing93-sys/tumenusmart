import { NextResponse } from "next/server";
import { sesionActual } from "@/lib/auth";
import { puede } from "@/lib/permisos";
import { diaLargo, horaDeMinutos, partesLocales } from "@/lib/agenda";
import { nombreCompleto } from "@/lib/agenda-personal";
import { urlReservaCancha } from "@/lib/canchas";
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
 * suene y avise sin recargar (ver AvisoReservasNuevas): los turnos de la agenda y las reservas de canchas. Devuelve las
 * últimas y es el panel quien recuerda cuáles ya avisó: así no depende de contar ni de que nada se borre.
 *
 * Es una ruta de API: no pasa por el layout del panel, así que valida la sesión y el permiso por su cuenta. Cada cosa se
 * muestra solo a quien puede ver ese calendario.
 */
export async function GET() {
  const sesion = await sesionActual();
  if (!sesion) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const verTurnos = puede(sesion.rol, "agenda.ver");
  const verCanchas = puede(sesion.rol, "canchas.ver");
  if (!verTurnos && !verCanchas) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const db = prismaDelLocal(await idLocalActual());
  const desde = new Date(Date.now() - VENTANA_MINUTOS * 60_000);

  const [citas, reservasCancha] = await Promise.all([
    verTurnos
      ? db.cita.findMany({
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
            createdAt: true,
            personal: { select: { nombre: true, apellido: true } },
          },
        })
      : Promise.resolve([]),
    verCanchas
      ? db.reservaCancha.findMany({
          where: {
            origen: "web",
            visible: true,
            createdAt: { gte: desde },
            estado: { notIn: ["cancelada", "no_asistio"] },
          },
          orderBy: { createdAt: "desc" },
          take: 20,
          select: { id: true, clienteNombre: true, canchaNombre: true, inicio: true, duracionMin: true, createdAt: true },
        })
      : Promise.resolve([]),
  ]);

  const deTurnos = citas.map((c) => {
    const { dia, minutos } = partesLocales(c.inicio);
    const hora = horaDeMinutos(minutos);
    return {
      creada: c.createdAt.getTime(),
      reserva: {
        id: c.id,
        cliente: c.clienteNombre,
        servicios: c.serviciosTexto,
        personal: nombreCompleto(c.personal),
        dia,
        hora,
        cuando: `${diaLargo(dia)} a las ${hora}`,
      },
    };
  });

  const deCanchas = reservasCancha.map((r) => {
    const { dia, minutos } = partesLocales(r.inicio);
    const hora = horaDeMinutos(minutos);
    return {
      creada: r.createdAt.getTime(),
      reserva: {
        id: r.id,
        cliente: r.clienteNombre,
        servicios: null,
        personal: r.canchaNombre,
        // Lo que el aviso muestra en lugar de "con <persona>", y a dónde lleva el botón Ver.
        lugar: r.canchaNombre,
        enlace: urlReservaCancha({ fecha: dia, tipo: null, canceladas: false }, r.id),
        dia,
        hora,
        cuando: `${diaLargo(dia)} a las ${hora}`,
      },
    };
  });

  const reservas = [...deTurnos, ...deCanchas]
    .sort((a, b) => b.creada - a.creada)
    .slice(0, 20)
    .map((x) => x.reserva);

  return NextResponse.json({ reservas }, { headers: { "Cache-Control": "no-store" } });
}
