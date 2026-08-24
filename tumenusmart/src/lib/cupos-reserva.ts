import { prisma } from "./prisma";
import { fechaAsuncionDesdeTexto } from "./timezone";

export type DisponibilidadHorario = {
  turno: string;
  hora: string;
  /** null = sin límite configurado */
  capacidad: number | null;
  /** personas ya reservadas en ese horario para esa fecha */
  ocupado: number;
  /** null cuando no hay límite */
  lugaresLibres: number | null;
};

/**
 * Ocupación de cada horario para una fecha puntual.
 *
 * Solo suman las reservas que el cliente envió por WhatsApp y que no están
 * canceladas: una reserva a medio armar, o una que el local dio de baja, no
 * debería estar ocupando una mesa.
 */
export async function calcularDisponibilidad(
  storeId: string,
  fechaTexto: string
): Promise<DisponibilidadHorario[]> {
  const fecha = fechaAsuncionDesdeTexto(fechaTexto);
  if (!fecha) return [];

  const finDelDia = new Date(fecha.getTime() + 24 * 60 * 60 * 1000);

  const [horarios, reservas] = await Promise.all([
    prisma.horarioReserva.findMany({
      where: { storeId, activo: true },
      orderBy: [{ turno: "asc" }, { hora: "asc" }],
    }),
    prisma.reservation.findMany({
      where: {
        storeId,
        fecha: { gte: fecha, lt: finDelDia },
        enviadoWhatsapp: true,
        estado: { not: "cancelada" },
      },
      select: { horario: true, personas: true },
    }),
  ]);

  const ocupacion = new Map<string, number>();
  for (const r of reservas) {
    ocupacion.set(r.horario, (ocupacion.get(r.horario) ?? 0) + r.personas);
  }

  return horarios.map((h) => {
    const ocupado = ocupacion.get(h.hora) ?? 0;
    const capacidad = h.capacidadPersonas ?? null;
    return {
      turno: h.turno,
      hora: h.hora,
      capacidad,
      ocupado,
      lugaresLibres: capacidad == null ? null : Math.max(0, capacidad - ocupado),
    };
  });
}

/**
 * Verifica que entren `personas` en el horario pedido. Devuelve el mensaje
 * de error, o null si hay lugar. Se usa en el server action antes de crear
 * la reserva, que es el único punto donde el chequeo es confiable.
 */
export async function motivoSinCupo(
  storeId: string,
  fechaTexto: string,
  horario: string,
  personas: number
): Promise<string | null> {
  const disponibilidad = await calcularDisponibilidad(storeId, fechaTexto);
  const slot = disponibilidad.find((d) => d.hora === horario);

  // Sin límite configurado (o horario que ya no existe): no se bloquea nada.
  if (!slot || slot.capacidad == null) return null;

  if (slot.lugaresLibres === 0) {
    return `El horario de las ${horario} ya está completo. Elegí otro horario u otra fecha.`;
  }
  if (personas > (slot.lugaresLibres ?? 0)) {
    return `En el horario de las ${horario} quedan ${slot.lugaresLibres} ${
      slot.lugaresLibres === 1 ? "lugar" : "lugares"
    } y estás pidiendo para ${personas}. Elegí otro horario u otra fecha.`;
  }
  return null;
}
