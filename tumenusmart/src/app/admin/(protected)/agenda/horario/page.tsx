import { pantallaConPermiso } from "@/lib/auth";
import { idLocalActual } from "@/lib/local-actual";
import { prismaDelLocal } from "@/lib/prisma-local";
import { Cabecera } from "@/components/ui";
import { completarHorario } from "@/lib/horario-trabajo";
import { EditorHorario } from "./EditorHorario";

export const dynamic = "force-dynamic";

/**
 * El horario general de trabajo de la Reserva de turnos: qué días se atiende,
 * de qué hora a qué hora y el descanso del medio. Solo el dueño lo arma. Si
 * todavía no se guardó nada, se muestra un horario de ejemplo (lunes a sábado
 * de 9 a 18, descanso de 13 a 14) que recién cuenta cuando se aprieta Guardar.
 */
export default async function HorarioTrabajoPage() {
  await pantallaConPermiso("agenda.configurar");
  const db = prismaDelLocal(await idLocalActual());

  const filas = await db.horarioTrabajo.findMany({
    select: {
      diaSemana: true,
      trabaja: true,
      inicio: true,
      fin: true,
      descansa: true,
      descansoInicio: true,
      descansoFin: true,
    },
  });

  return (
    <div className="flex flex-col gap-3">
      <Cabecera titulo="Horario de trabajo" bajada="Horario general – Horas de trabajo y Descanso" />
      <EditorHorario inicial={completarHorario(filas)} />
    </div>
  );
}
