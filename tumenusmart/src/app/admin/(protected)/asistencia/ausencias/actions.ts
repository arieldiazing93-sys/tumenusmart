"use server";

import { revalidatePath } from "next/cache";
import { exigirPermiso } from "@/lib/auth";
import { nombreDeColaborador } from "@/lib/asistencia";
import { diasEntre, esDiaValido, esTipoAusencia, etiquetaDeAusencia } from "@/lib/ausencias";
import { registrarBitacora } from "@/lib/bitacora";
import { idLocalActual } from "@/lib/local-actual";
import { prismaDelLocal, type PrismaLocal } from "@/lib/prisma-local";
import { diaEnTexto } from "@/lib/rango-dias";

export type DatosAusencia = {
  /** Presente al editar un registro; ausente al crear uno. */
  id?: string;
  /** La persona, o "todos" para anotarlo a todo el personal activo (un feriado, por ejemplo). Al editar no cambia. */
  colaboradorId: string;
  tipo: string;
  desde: string;
  hasta: string;
  pagado: boolean;
  nota: string;
};

export type ResultadoAusencia =
  | { ok: true; creadas: number; omitidas: number }
  | { ok: false; error: string };

export type ResultadoEliminarAusencia = { ok: true } | { ok: false; error: string };

const LARGO_MAXIMO_NOTA = 300;
const DIAS_MAXIMOS_REGISTRO = 366;
/** El mismo valor que el calendario: ni antes de esto ni después de 2100 es un día que alguien quiera anotar. */
const PRIMER_ANIO = "2020";
const ULTIMO_ANIO = "2100";

function refrescarPantallas() {
  revalidatePath("/admin/asistencia");
  revalidatePath("/admin/asistencia/ausencias");
  revalidatePath("/admin/asistencia/liquidacion");
}

/** Si esa persona ya tiene algo anotado que se pise con esos días, lo devuelve (para decirle cuál). */
async function registroQueChoca(db: PrismaLocal, colaboradorId: string, desde: string, hasta: string, exceptoId?: string) {
  return db.ausenciaColaborador.findFirst({
    where: {
      colaboradorId,
      desde: { lte: hasta },
      hasta: { gte: desde },
      ...(exceptoId ? { id: { not: exceptoId } } : {}),
    },
    select: { desde: true, hasta: true, tipo: true },
  });
}

function rangoEnTexto(desde: string, hasta: string): string {
  return desde === hasta ? diaEnTexto(desde) : `del ${diaEnTexto(desde)} al ${diaEnTexto(hasta)}`;
}

/**
 * Anota (o corrige) una ausencia: un día o varios seguidos en que alguien no fue y por qué, y si ese día se le paga. Sin esto, un
 * día sin marcación es una falta sin aviso. Solo el dueño (asistencia.gestionar). Nunca se pisan dos registros de la misma persona.
 */
export async function guardarAusencia(datos: DatosAusencia): Promise<ResultadoAusencia> {
  const sesion = await exigirPermiso("asistencia.gestionar");
  const idLocal = await idLocalActual();
  const db = prismaDelLocal(idLocal);

  const tipo = String(datos.tipo ?? "");
  if (!esTipoAusencia(tipo)) return { ok: false, error: "Elegí qué pasó ese día." };
  const desde = String(datos.desde ?? "");
  const hasta = String(datos.hasta || datos.desde || "");
  if (!esDiaValido(desde) || !esDiaValido(hasta) || desde.slice(0, 4) < PRIMER_ANIO || hasta.slice(0, 4) > ULTIMO_ANIO) {
    return { ok: false, error: "Las fechas no son válidas." };
  }
  if (desde > hasta) return { ok: false, error: "El primer día no puede ser posterior al último." };
  if (diasEntre(desde, hasta, DIAS_MAXIMOS_REGISTRO + 1).length > DIAS_MAXIMOS_REGISTRO) {
    return { ok: false, error: `Un registro puede abarcar hasta ${DIAS_MAXIMOS_REGISTRO} días. Anotalo en partes.` };
  }
  const nota = String(datos.nota ?? "").trim();
  if (nota.length > LARGO_MAXIMO_NOTA) {
    return { ok: false, error: `El comentario puede tener hasta ${LARGO_MAXIMO_NOTA} letras.` };
  }
  const pagado = datos.pagado === true;
  const creadoPor = sesion.nombre?.trim() || sesion.email;
  const queFue = etiquetaDeAusencia(tipo);

  // ---------- corregir uno que ya existe ----------
  if (datos.id) {
    const existente = await db.ausenciaColaborador.findFirst({
      where: { id: datos.id },
      select: { colaboradorId: true, colaborador: { select: { nombre: true, apellido: true } } },
    });
    if (!existente) return { ok: false, error: "No se encontró ese registro." };
    const choca = await registroQueChoca(db, existente.colaboradorId, desde, hasta, datos.id);
    if (choca) {
      return {
        ok: false,
        error: `Esa persona ya tiene anotado "${etiquetaDeAusencia(choca.tipo)}" ${rangoEnTexto(choca.desde, choca.hasta)}. Corregí las fechas.`,
      };
    }
    await db.ausenciaColaborador.updateMany({
      where: { id: datos.id },
      data: { tipo, desde, hasta, pagado, nota: nota || null },
    });
    await registrarBitacora(idLocal, sesion, {
      modulo: "asistencia",
      accion: "ausencia_editada",
      descripcion: `Corrigió la ausencia de ${nombreDeColaborador(existente.colaborador)}: ${queFue} ${rangoEnTexto(desde, hasta)} (${
        pagado ? "se paga" : "sin goce"
      }).`,
      entidad: "AusenciaColaborador",
      entidadId: datos.id,
      detalle: { tipo, desde, hasta, pagado, nota: nota || null },
    });
    refrescarPantallas();
    return { ok: true, creadas: 0, omitidas: 0 };
  }

  // ---------- anotar uno nuevo (a una persona, o a todo el personal activo) ----------
  const colaboradorId = String(datos.colaboradorId ?? "");
  if (!colaboradorId) return { ok: false, error: "Elegí a quién." };

  const personas =
    colaboradorId === "todos"
      ? await db.colaborador.findMany({ where: { activo: true }, select: { id: true, nombre: true, apellido: true } })
      : await db.colaborador.findMany({ where: { id: colaboradorId }, select: { id: true, nombre: true, apellido: true } });
  if (personas.length === 0) {
    return { ok: false, error: colaboradorId === "todos" ? "No hay personal activo." : "No se encontró a esa persona." };
  }

  let creadas = 0;
  let omitidas = 0;
  for (const p of personas) {
    const choca = await registroQueChoca(db, p.id, desde, hasta);
    if (choca) {
      if (colaboradorId !== "todos") {
        return {
          ok: false,
          error: `${nombreDeColaborador(p)} ya tiene anotado "${etiquetaDeAusencia(choca.tipo)}" ${rangoEnTexto(
            choca.desde,
            choca.hasta
          )}. Editá ese registro en vez de crear otro.`,
        };
      }
      omitidas += 1;
      continue;
    }
    await db.ausenciaColaborador.create({
      data: { storeId: idLocal, colaboradorId: p.id, tipo, desde, hasta, pagado, nota: nota || null, creadoPor },
    });
    creadas += 1;
  }

  const aQuien = colaboradorId === "todos" ? `a ${creadas} ${creadas === 1 ? "persona" : "personas"}` : `a ${nombreDeColaborador(personas[0])}`;
  await registrarBitacora(idLocal, sesion, {
    modulo: "asistencia",
    accion: "ausencia_creada",
    descripcion: `Anotó ${queFue} ${rangoEnTexto(desde, hasta)} ${aQuien} (${pagado ? "se paga" : "sin goce"}).`,
    entidad: "AusenciaColaborador",
    entidadId: colaboradorId === "todos" ? undefined : personas[0].id,
    detalle: { tipo, desde, hasta, pagado, nota: nota || null, creadas, omitidas },
  });

  refrescarPantallas();
  return { ok: true, creadas, omitidas };
}

/** Borra un registro de ausencia: ese día vuelve a ser una falta sin aviso (si la persona tenía que ir y no marcó). */
export async function eliminarAusencia(id: string): Promise<ResultadoEliminarAusencia> {
  const sesion = await exigirPermiso("asistencia.gestionar");
  const idLocal = await idLocalActual();
  const db = prismaDelLocal(idLocal);

  const existente = await db.ausenciaColaborador.findFirst({
    where: { id },
    select: { tipo: true, desde: true, hasta: true, colaborador: { select: { nombre: true, apellido: true } } },
  });
  if (!existente) return { ok: false, error: "Ese registro ya no existe." };

  await db.ausenciaColaborador.deleteMany({ where: { id } });
  await registrarBitacora(idLocal, sesion, {
    modulo: "asistencia",
    accion: "ausencia_eliminada",
    descripcion: `Borró la ausencia de ${nombreDeColaborador(existente.colaborador)}: ${etiquetaDeAusencia(existente.tipo)} ${rangoEnTexto(
      existente.desde,
      existente.hasta
    )}.`,
    entidad: "AusenciaColaborador",
    entidadId: id,
  });
  refrescarPantallas();
  return { ok: true };
}
