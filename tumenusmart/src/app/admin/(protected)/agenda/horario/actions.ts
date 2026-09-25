"use server";

import { revalidatePath } from "next/cache";
import { exigirPermiso } from "@/lib/auth";
import { registrarBitacora } from "@/lib/bitacora";
import { idLocalActual } from "@/lib/local-actual";
import { nombreCompleto } from "@/lib/agenda-personal";
import { prisma } from "@/lib/prisma";
import { prismaDelLocal } from "@/lib/prisma-local";
import { completarHorario, esHoraValida, nombreDeDia, validarHorario, type HorarioDia } from "@/lib/horario-trabajo";

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

/** El resumen de la semana que se deja en la bitácora. */
function detalleDeDias(dias: HorarioDia[]) {
  return {
    dias: dias.map((d) => ({
      dia: nombreDeDia(d.diaSemana),
      trabaja: d.trabaja,
      horario: d.trabaja ? `${d.inicio}-${d.fin}` : null,
      descanso: d.trabaja && d.descansa ? `${d.descansoInicio}-${d.descansoFin}` : null,
    })),
  };
}

const COLUMNAS_DE_HORARIO = {
  diaSemana: true,
  trabaja: true,
  inicio: true,
  fin: true,
  descansa: true,
  descansoInicio: true,
  descansoFin: true,
} as const;

/** La persona, si es de este local (una id de otro negocio simplemente no aparece). */
async function personaDelLocal(storeId: string, personalId: unknown) {
  if (typeof personalId !== "string" || !personalId) return null;
  return prismaDelLocal(storeId).miembroPersonal.findFirst({
    where: { id: personalId },
    select: { id: true, nombre: true, apellido: true },
  });
}

function refrescarPantallas() {
  revalidatePath("/admin/agenda/horario");
  revalidatePath("/admin/agenda/personal");
  revalidatePath("/admin/agenda");
}

/**
 * Guarda un horario: los siete días juntos, o ninguno. Sin `personalId` es el horario general del negocio (el que
 * usa el personal que no tiene el suyo); con `personalId`, el horario propio de esa persona.
 */
export async function guardarHorarioTrabajo(
  entrada: HorarioDia[],
  personalId?: string | null
): Promise<ResultadoHorario> {
  const sesion = await exigirPermiso("agenda.configurar");
  const storeId = await idLocalActual();

  const saneado = sanear(entrada);
  if (!saneado.ok) return saneado;

  if (personalId) {
    const persona = await personaDelLocal(storeId, personalId);
    if (!persona) return { ok: false, error: "No se encontró a esa persona." };

    // Cliente sin filtro con el local explícito en cada fila, igual que otras escrituras en bloque.
    await prisma.$transaction(
      saneado.dias.map((d) => {
        const { diaSemana, ...datos } = d;
        return prisma.horarioPersonal.upsert({
          where: { personalId_diaSemana: { personalId: persona.id, diaSemana } },
          create: { storeId, personalId: persona.id, diaSemana, ...datos },
          update: datos,
        });
      })
    );

    await registrarBitacora(storeId, sesion, {
      modulo: "agenda",
      accion: "horario_personal_guardado",
      descripcion: `Actualizó el horario de trabajo de ${nombreCompleto(persona)}.`,
      entidad: "HorarioPersonal",
      entidadId: persona.id,
      detalle: detalleDeDias(saneado.dias),
    });

    refrescarPantallas();
    return { ok: true };
  }

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
    detalle: detalleDeDias(saneado.dias),
  });

  refrescarPantallas();
  return { ok: true };
}

/**
 * Le da a una persona un horario propio: arranca como copia del horario general (o del de ejemplo si todavía no se
 * guardó ninguno) y después se lo ajusta. Si ya tiene uno, no toca nada.
 */
export async function darHorarioPropio(personalId: string): Promise<ResultadoHorario> {
  const sesion = await exigirPermiso("agenda.configurar");
  const storeId = await idLocalActual();

  const persona = await personaDelLocal(storeId, personalId);
  if (!persona) return { ok: false, error: "No se encontró a esa persona." };

  const yaTiene = await prisma.horarioPersonal.count({ where: { storeId, personalId: persona.id } });
  if (yaTiene > 0) return { ok: true };

  const generales = await prisma.horarioTrabajo.findMany({ where: { storeId }, select: COLUMNAS_DE_HORARIO });
  await prisma.horarioPersonal.createMany({
    data: completarHorario(generales).map((d) => ({ storeId, personalId: persona.id, ...d })),
    skipDuplicates: true,
  });

  await registrarBitacora(storeId, sesion, {
    modulo: "agenda",
    accion: "horario_personal_creado",
    descripcion: `Le dio un horario propio a ${nombreCompleto(persona)} (arrancó igual al general).`,
    entidad: "HorarioPersonal",
    entidadId: persona.id,
  });

  refrescarPantallas();
  return { ok: true };
}

/** Le saca a una persona su horario propio: desde ese momento usa el horario general del negocio. */
export async function usarHorarioGeneral(personalId: string): Promise<ResultadoHorario> {
  const sesion = await exigirPermiso("agenda.configurar");
  const storeId = await idLocalActual();

  const persona = await personaDelLocal(storeId, personalId);
  if (!persona) return { ok: false, error: "No se encontró a esa persona." };

  await prisma.horarioPersonal.deleteMany({ where: { storeId, personalId: persona.id } });

  await registrarBitacora(storeId, sesion, {
    modulo: "agenda",
    accion: "horario_personal_quitado",
    descripcion: `${nombreCompleto(persona)} vuelve a usar el horario general.`,
    entidad: "HorarioPersonal",
    entidadId: persona.id,
  });

  refrescarPantallas();
  return { ok: true };
}
