"use server";

import { revalidatePath } from "next/cache";
import { exigirPermiso } from "@/lib/auth";
import { registrarBitacora } from "@/lib/bitacora";
import { idLocalActual } from "@/lib/local-actual";
import { prismaDelLocal } from "@/lib/prisma-local";
import { nombreCompleto, normalizarTelefonoPersonal } from "@/lib/agenda-personal";
import { subirFotoPersonal } from "@/lib/supabase-storage";

export type ResultadoPersonal = { ok: true } | { ok: false; error: string };
export type ResultadoFotoPersonal = { ok: true; url: string } | { ok: false; error: string };

const LARGO_MAXIMO_TEXTO = 60;

function texto(valor: FormDataEntryValue | null): string {
  return String(valor ?? "").trim();
}

type DatosPersonal = {
  nombre: string;
  apellido: string;
  telefono: string;
  profesion: string | null;
  fotoUrl: string | null;
};

/** Lee y valida lo que mandó el formulario. Nunca se guarda lo que llega tal cual. */
function leerDatos(formData: FormData): { ok: true; datos: DatosPersonal } | { ok: false; error: string } {
  const nombre = texto(formData.get("nombre"));
  if (!nombre) return { ok: false, error: "El nombre es obligatorio" };
  const apellido = texto(formData.get("apellido"));
  if (!apellido) return { ok: false, error: "El apellido es obligatorio" };
  const profesion = texto(formData.get("profesion"));
  if ([nombre, apellido, profesion].some((t) => t.length > LARGO_MAXIMO_TEXTO)) {
    return { ok: false, error: `Nombre, apellido y profesión pueden tener hasta ${LARGO_MAXIMO_TEXTO} letras` };
  }

  const telefono = normalizarTelefonoPersonal(texto(formData.get("codigoPais")), texto(formData.get("telefono")));
  if (!telefono.ok) return { ok: false, error: telefono.error };

  // La foto se sube aparte (subirFotoDelPersonal) y acá solo llega su dirección.
  const fotoUrl = texto(formData.get("fotoUrl"));
  if (fotoUrl && !/^https:\/\//i.test(fotoUrl)) return { ok: false, error: "La foto no es válida. Subila de nuevo." };

  return {
    ok: true,
    datos: { nombre, apellido, telefono: telefono.telefono, profesion: profesion || null, fotoUrl: fotoUrl || null },
  };
}

function refrescarPantallas() {
  revalidatePath("/admin/agenda");
  revalidatePath("/admin/agenda/personal");
}

/**
 * Sube la foto en cuanto se elige, antes de guardar el formulario: así se ve
 * enseguida en el círculo. Si después se cancela, la imagen queda sin usar en
 * el almacenamiento (igual que con el logo del negocio).
 */
export async function subirFotoDelPersonal(formData: FormData): Promise<ResultadoFotoPersonal> {
  await exigirPermiso("agenda.configurar");
  const archivo = formData.get("archivo");
  if (!(archivo instanceof File)) return { ok: false, error: "No se recibió ninguna imagen" };
  try {
    return { ok: true, url: await subirFotoPersonal(archivo) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "No se pudo subir la foto" };
  }
}

export async function crearPersonal(formData: FormData): Promise<ResultadoPersonal> {
  const sesion = await exigirPermiso("agenda.configurar");
  const idLocal = await idLocalActual();
  const prisma = prismaDelLocal(idLocal);

  const leido = leerDatos(formData);
  if (!leido.ok) return leido;

  const creado = await prisma.miembroPersonal.create({
    data: { storeId: idLocal, ...leido.datos },
    select: { id: true },
  });

  await registrarBitacora(idLocal, sesion, {
    modulo: "agenda",
    accion: "personal_creado",
    descripcion: `Agregó a ${nombreCompleto(leido.datos)} al personal de la agenda.`,
    entidad: "MiembroPersonal",
    entidadId: creado.id,
    detalle: { profesion: leido.datos.profesion },
  });

  refrescarPantallas();
  return { ok: true };
}

export async function actualizarPersonal(id: string, formData: FormData): Promise<ResultadoPersonal> {
  const sesion = await exigirPermiso("agenda.configurar");
  const idLocal = await idLocalActual();
  const prisma = prismaDelLocal(idLocal);

  const leido = leerDatos(formData);
  if (!leido.ok) return leido;
  const activo = formData.get("activo") === "on";

  // Se lee primero (filtrado por local) para saber si existe y si cambió el estado.
  const anterior = await prisma.miembroPersonal.findFirst({ where: { id }, select: { activo: true } });
  if (!anterior) return { ok: false, error: "No se encontró a esa persona." };

  await prisma.miembroPersonal.updateMany({ where: { id }, data: { ...leido.datos, activo } });

  const nombre = nombreCompleto(leido.datos);
  const cambioEstado = anterior.activo !== activo;
  await registrarBitacora(idLocal, sesion, {
    modulo: "agenda",
    accion: cambioEstado ? (activo ? "personal_activado" : "personal_desactivado") : "personal_editado",
    descripcion: cambioEstado
      ? `${activo ? "Volvió a activar" : "Desactivó"} a ${nombre} en el personal de la agenda.`
      : `Editó los datos de ${nombre} en el personal de la agenda.`,
    entidad: "MiembroPersonal",
    entidadId: id,
  });

  refrescarPantallas();
  return { ok: true };
}
