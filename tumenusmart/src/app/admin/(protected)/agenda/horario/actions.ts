"use server";

import { revalidatePath } from "next/cache";
import { exigirPermiso } from "@/lib/auth";
import { registrarBitacora } from "@/lib/bitacora";
import { idLocalActual } from "@/lib/local-actual";
import { prisma } from "@/lib/prisma";
import { esHoraValida, nombreDeDia, validarHorario, type HorarioDia } from "@/lib/horario-trabajo";

export type ResultadoHorario = { ok: true } | { ok: false; error: string };

/**
 * Lo que llega del navegador no se guarda tal cual: se revisa que sean los siete
 * días, sin repetir, con horas bien escritas, y se arman objetos nuevos con solo
 * los campos que corresponden.
 */
function sanear(entrada: unknown): { ok: true; dias: HorarioDia[] } | { ok: false; error: string } {
  const invalido = { ok: false as const, error: "El horario que llegó no es válido. Recargá la página e intentá de nuevo." };
  if (!Array.isArray(entrada) || entrada.length !== 7) return invalido;

  const dias: HorarioDia[] = [];
  const vistos = new Set<number>();
  for (const fila of entrada) {
    if (!fila || typeof fila !== "object") return invalido;
    const f = fila as Record<string, unknown>;
    const diaSemana = f.diaSemana;
    if (typeof diaSemana !== "number" || !Number.isInteger(diaSemana) || diaSemana < 0 || diaSemana > 6) return invalido;
    if (vistos.has(diaSemana)) return invalido;
    vistos.add(diaSemana);
    if (typeof f.trabaja !== "boolean" || typeof f.descansa !== "boolean") return invalido;
    if (![f.inicio, f.fin, f.descansoInicio, f.descansoFin].every(esHoraValida)) {
      return { ok: false, error: `${nombreDeDia(diaSemana)}: hay una hora sin completar.` };
    }
    dias.push({
      diaSemana,
      trabaja: f.trabaja,
      inicio: f.inicio as string,
      fin: f.fin as string,
      descansa: f.descansa,
      descansoInicio: f.descansoInicio as string,
      descansoFin: f.descansoFin as string,
    });
  }

  const error = validarHorario(dias);
  return error ? { ok: false, error } : { ok: true, dias };
}

/** Guarda el horario general: los siete días juntos, o ninguno. */
export async function guardarHorarioTrabajo(entrada: HorarioDia[]): Promise<ResultadoHorario> {
  const sesion = await exigirPermiso("agenda.configurar");
  const storeId = await idLocalActual();

  const saneado = sanear(entrada);
  if (!saneado.ok) return saneado;

  // Cliente sin filtro con el local explícito en cada fila, igual que otras
  // escrituras en bloque: la transacción en arreglo lo pide así.
  await prisma.$transaction(
    saneado.dias.map((d) => {
      const { diaSemana, ...datos } = d;
      return prisma.horarioTrabajo.upsert({
        where: { storeId_diaSemana: { storeId, diaSemana } },
        create: { storeId, diaSemana, ...datos },
        update: datos,
      });
    })
  );

  await registrarBitacora(storeId, sesion, {
    modulo: "agenda",
    accion: "horario_guardado",
    descripcion: "Actualizó el horario de trabajo de la agenda.",
    entidad: "HorarioTrabajo",
    detalle: {
      dias: saneado.dias.map((d) => ({
        dia: nombreDeDia(d.diaSemana),
        trabaja: d.trabaja,
        horario: d.trabaja ? `${d.inicio}-${d.fin}` : null,
        descanso: d.trabaja && d.descansa ? `${d.descansoInicio}-${d.descansoFin}` : null,
      })),
    },
  });

  revalidatePath("/admin/agenda/horario");
  revalidatePath("/admin/agenda");
  return { ok: true };
}
