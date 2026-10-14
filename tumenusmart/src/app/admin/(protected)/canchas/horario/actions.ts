"use server";

import { revalidatePath } from "next/cache";
import { exigirPermiso } from "@/lib/auth";
import { registrarBitacora } from "@/lib/bitacora";
import { nombreDeDia, sanearHorarioSemana, type HorarioDia } from "@/lib/horario-trabajo";
import { idLocalActual } from "@/lib/local-actual";
import { prisma } from "@/lib/prisma";

export type ResultadoHorarioCanchas = { ok: true } | { ok: false; error: string };

/**
 * Guarda el horario del complejo: los siete días juntos, o ninguno. Es el horario que usan todas las canchas (qué días
 * se abre, de qué hora a qué hora y el descanso del medio). Lo que llega no se guarda tal cual: se revisa día por día.
 */
export async function guardarHorarioCanchas(entrada: HorarioDia[]): Promise<ResultadoHorarioCanchas> {
  const sesion = await exigirPermiso("canchas.configurar");
  const storeId = await idLocalActual();

  const saneado = sanearHorarioSemana(entrada);
  if (!saneado.ok) return saneado;

  // Cliente sin filtro con el local explícito en cada fila, igual que otras escrituras en bloque: la transacción en
  // arreglo lo pide así.
  await prisma.$transaction(
    saneado.dias.map((d) => {
      const { diaSemana, ...datos } = d;
      return prisma.horarioCanchas.upsert({
        where: { storeId_diaSemana: { storeId, diaSemana } },
        create: { storeId, diaSemana, ...datos },
        update: datos,
      });
    })
  );

  await registrarBitacora(storeId, sesion, {
    modulo: "canchas",
    accion: "horario_guardado",
    descripcion: "Actualizó el horario del complejo.",
    entidad: "HorarioCanchas",
    detalle: {
      dias: saneado.dias.map((d) => ({
        dia: nombreDeDia(d.diaSemana),
        trabaja: d.trabaja,
        horario: d.trabaja ? `${d.inicio}-${d.fin}` : null,
        descanso: d.trabaja && d.descansa ? `${d.descansoInicio}-${d.descansoFin}` : null,
      })),
    },
  });

  revalidatePath("/admin/canchas/horario");
  revalidatePath("/admin/canchas");
  return { ok: true };
}
