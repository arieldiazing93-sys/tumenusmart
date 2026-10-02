"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { exigirPermiso } from "@/lib/auth";
import { MINUTOS_ENTRE_MARCAS_MAXIMO } from "@/lib/asistencia";
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

/**
 * Cuántos minutos tienen que pasar entre una marcación de una persona y la siguiente suya. Evita marcar dos veces por
 * error y que alguien marque entrada y salida seguidas. 0 = sin espera.
 */
export async function guardarMinutosEntreMarcas(minutos: number): Promise<ResultadoEnlaceAsistencia> {
  const sesion = await exigirPermiso("asistencia.gestionar");
  const idLocal = await idLocalActual();

  if (!Number.isInteger(minutos) || minutos < 0 || minutos > MINUTOS_ENTRE_MARCAS_MAXIMO) {
    return { ok: false, error: `Son minutos enteros, de 0 a ${MINUTOS_ENTRE_MARCAS_MAXIMO}.` };
  }

  await prisma.store.update({ where: { id: idLocal }, data: { minutosEntreMarcas: minutos } });

  await registrarBitacora(idLocal, sesion, {
    modulo: "asistencia",
    accion: "minutos_entre_marcas_cambiado",
    descripcion: `Cambió el tiempo mínimo entre una marcación y la siguiente a ${minutos} min.`,
    entidad: "Store",
    entidadId: idLocal,
    detalle: { minutos },
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
