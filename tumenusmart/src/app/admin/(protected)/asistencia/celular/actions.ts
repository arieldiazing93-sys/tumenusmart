"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { exigirPermiso } from "@/lib/auth";
import { ALMUERZO_MAXIMO_MIN, MINUTOS_ENTRE_MARCAS_MAXIMO, horaValida } from "@/lib/asistencia";
import { registrarBitacora } from "@/lib/bitacora";
import { idLocalActual } from "@/lib/local-actual";
import { prisma } from "@/lib/prisma";

export type ResultadoEnlaceAsistencia = { ok: true } | { ok: false; error: string };

/**
 * Activa el celular fijo, o saca una llave nueva si ya había una: el enlace anterior deja de funcionar al
 * instante (sirve si el celular se perdió o la dirección se la pasaron a quien no debía). La llave son 24 bytes
 * al azar —imposible de adivinar— y se guarda en el propio local (Store no está entre los modelos filtrados
 * por local, por eso va con el cliente sin filtro y el id del local de la sesión).
 */
export async function generarEnlaceAsistencia(): Promise<ResultadoEnlaceAsistencia> {
  const sesion = await exigirPermiso("asistencia.gestionar");
  const idLocal = await idLocalActual();

  const anterior = await prisma.store.findUnique({ where: { id: idLocal }, select: { tokenAsistencia: true } });
  const token = randomBytes(24).toString("base64url");
  await prisma.store.update({ where: { id: idLocal }, data: { tokenAsistencia: token } });

  await registrarBitacora(idLocal, sesion, {
    modulo: "asistencia",
    accion: anterior?.tokenAsistencia ? "enlace_regenerado" : "enlace_activado",
    descripcion: anterior?.tokenAsistencia
      ? "Generó un enlace nuevo para el celular fijo de asistencia: el anterior dejó de funcionar."
      : "Activó el celular fijo de asistencia.",
    entidad: "Store",
    entidadId: idLocal,
  });

  revalidatePath("/admin/asistencia/celular");
  return { ok: true };
}

export type ReglasMarcacionForm = {
  /** Minutos que tienen que pasar entre una marcación de una persona y la siguiente suya (0 = sin espera). */
  minutosEntreMarcas: number;
  /** El horario de almuerzo del negocio, "HH:MM". */
  almuerzoDesde: string;
  almuerzoHasta: string;
  /** Lo máximo que puede pasar entre la salida a almorzar y la vuelta, en minutos. */
  almuerzoMaxMin: number;
};

/**
 * Guarda las reglas del celular fijo. El tiempo entre marcaciones evita marcar dos veces por error y que alguien
 * marque entrada y salida seguidas. El horario de almuerzo es lo que le permite al sistema decidir solo si una marcación
 * de quien ya entró es la salida a almorzar (dentro del horario) o la salida del día (fuera de él).
 */
export async function guardarReglasMarcacion(reglas: ReglasMarcacionForm): Promise<ResultadoEnlaceAsistencia> {
  const sesion = await exigirPermiso("asistencia.gestionar");
  const idLocal = await idLocalActual();

  if (
    !Number.isInteger(reglas.minutosEntreMarcas) ||
    reglas.minutosEntreMarcas < 0 ||
    reglas.minutosEntreMarcas > MINUTOS_ENTRE_MARCAS_MAXIMO
  ) {
    return { ok: false, error: `El tiempo entre marcaciones son minutos enteros, de 0 a ${MINUTOS_ENTRE_MARCAS_MAXIMO}.` };
  }
  if (!horaValida(reglas.almuerzoDesde) || !horaValida(reglas.almuerzoHasta)) {
    return { ok: false, error: "El horario de almuerzo no es válido: poné la hora de inicio y la de fin." };
  }
  if (reglas.almuerzoDesde === reglas.almuerzoHasta) {
    return { ok: false, error: "El horario de almuerzo no puede empezar y terminar a la misma hora." };
  }
  if (!Number.isInteger(reglas.almuerzoMaxMin) || reglas.almuerzoMaxMin < 10 || reglas.almuerzoMaxMin > ALMUERZO_MAXIMO_MIN) {
    return { ok: false, error: `El máximo de almuerzo son minutos enteros, de 10 a ${ALMUERZO_MAXIMO_MIN}.` };
  }

  await prisma.store.update({
    where: { id: idLocal },
    data: {
      minutosEntreMarcas: reglas.minutosEntreMarcas,
      almuerzoDesde: reglas.almuerzoDesde,
      almuerzoHasta: reglas.almuerzoHasta,
      almuerzoMaxMin: reglas.almuerzoMaxMin,
    },
  });

  await registrarBitacora(idLocal, sesion, {
    modulo: "asistencia",
    accion: "reglas_de_marcacion_cambiadas",
    descripcion: `Cambió las reglas del celular fijo: ${reglas.minutosEntreMarcas} min entre marcaciones, almuerzo de ${reglas.almuerzoDesde} a ${reglas.almuerzoHasta} (hasta ${reglas.almuerzoMaxMin} min).`,
    entidad: "Store",
    entidadId: idLocal,
    detalle: { ...reglas },
  });

  revalidatePath("/admin/asistencia/celular");
  return { ok: true };
}

/** Apaga el celular fijo: el enlace deja de funcionar hasta que se vuelva a activar. */
export async function apagarEnlaceAsistencia(): Promise<ResultadoEnlaceAsistencia> {
  const sesion = await exigirPermiso("asistencia.gestionar");
  const idLocal = await idLocalActual();

  await prisma.store.update({ where: { id: idLocal }, data: { tokenAsistencia: null } });

  await registrarBitacora(idLocal, sesion, {
    modulo: "asistencia",
    accion: "enlace_apagado",
    descripcion: "Apagó el celular fijo de asistencia: el enlace dejó de funcionar.",
    entidad: "Store",
    entidadId: idLocal,
  });

  revalidatePath("/admin/asistencia/celular");
  return { ok: true };
}
