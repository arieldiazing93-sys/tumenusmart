import { pantallaConPermiso } from "@/lib/auth";
import { idLocalActual } from "@/lib/local-actual";
import { prisma } from "@/lib/prisma";
import { Cabecera } from "@/components/ui";
import { cargarHorarioCanchas } from "@/lib/canchas-publicas";
import { EditorHorario } from "../../agenda/horario/EditorHorario";
import { guardarHorarioCanchas } from "./actions";

export const dynamic = "force-dynamic";

/**
 * El horario del complejo: qué días se abre, de qué hora a qué hora y el descanso del medio. Es el mismo para todas las
 * canchas y es el que ven los clientes al reservar. Solo el dueño lo arma.
 *
 * Mientras no se guarde nada se muestra (y se ofrece al público) un horario de ejemplo: todos los días de 08:00 a la
 * medianoche. Para cerrar a la medianoche se escribe 23:59.
 */
export default async function HorarioCanchasPage() {
  await pantallaConPermiso("canchas.configurar");
  const storeId = await idLocalActual();
  // Con el local explícito: la función de lectura es la misma que usa la página pública.
  const inicial = await cargarHorarioCanchas(prisma, storeId);

  return (
    <div className="flex flex-col gap-3">
      <Cabecera
        titulo="Horario del complejo"
        bajada="Qué días abrís, de qué hora a qué hora y el descanso del medio. Es el horario de todas las canchas."
      />
      <p className="rounded-lg border border-linea bg-papel-suave px-3.5 py-2.5 text-[0.82rem] leading-snug text-tinta-media">
        Para cerrar a la medianoche escribí <strong>23:59</strong> en la hora de fin. Los clientes solo pueden reservar
        dentro de este horario; vos podés anotar reservas a mano en cualquier hora desde el calendario.
      </p>
      <EditorHorario
        inicial={inicial}
        guardar={guardarHorarioCanchas}
        nota="Los días apagados quedan cerrados: los clientes no pueden reservar ese día. Las reservas ya anotadas no se tocan."
      />
    </div>
  );
}
