"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { exigirPermiso } from "@/lib/auth";
import { AVISO_PIN_FACIL, horaValida, pinDemasiadoFacil, pinValido } from "@/lib/asistencia";
import { claveDePin } from "@/lib/asistencia-servidor";
import { registrarBitacora } from "@/lib/bitacora";
import { idLocalActual } from "@/lib/local-actual";
import { prismaDelLocal } from "@/lib/prisma-local";
import { subirFotoAsistencia } from "@/lib/supabase-storage";

export type ResultadoColaborador = { ok: true } | { ok: false; error: string };
export type ResultadoFotoColaborador = { ok: true; url: string } | { ok: false; error: string };

const LARGO_MAXIMO_TEXTO = 60;
const TOLERANCIA_MAXIMA_MIN = 120;
const ERROR_PIN_REPETIDO = "Ese PIN ya lo usa otra persona (o alguien inactivo). Elegí otro.";

function texto(valor: FormDataEntryValue | null): string {
  return String(valor ?? "").trim();
}

type DatosColaborador = {
  nombre: string;
  apellido: string | null;
  cargo: string | null;
  fotoUrl: string | null;
  haceAlmuerzo: boolean;
  horaEntrada: string | null;
  toleranciaMin: number;
  /** El PIN nuevo, en claro, solo si se escribió uno (se guarda su huella, nunca el PIN). */
  pin: string | null;
};

/** Lee y valida lo que mandó el formulario. Nunca se guarda lo que llega tal cual. */
function leerDatos(formData: FormData): { ok: true; datos: DatosColaborador } | { ok: false; error: string } {
  const nombre = texto(formData.get("nombre"));
  if (!nombre) return { ok: false, error: "El nombre es obligatorio" };
  const apellido = texto(formData.get("apellido"));
  const cargo = texto(formData.get("cargo"));
  if ([nombre, apellido, cargo].some((t) => t.length > LARGO_MAXIMO_TEXTO)) {
    return { ok: false, error: `Nombre, apellido y cargo pueden tener hasta ${LARGO_MAXIMO_TEXTO} letras` };
  }

  // La foto se sube aparte (subirFotoDelColaborador) y acá solo llega su dirección.
  const fotoUrl = texto(formData.get("fotoUrl"));
  if (fotoUrl && !/^https:\/\//i.test(fotoUrl)) return { ok: false, error: "La foto no es válida. Sacala de nuevo." };

  const pin = texto(formData.get("pin"));
  if (pin && !pinValido(pin)) return { ok: false, error: "El PIN tiene que ser de 4 a 6 números." };
  if (pin && pinDemasiadoFacil(pin)) return { ok: false, error: AVISO_PIN_FACIL };

  const horaEntrada = texto(formData.get("horaEntrada"));
  if (horaEntrada && !horaValida(horaEntrada)) return { ok: false, error: "La hora de entrada no es válida." };

  const toleranciaTexto = texto(formData.get("toleranciaMin"));
  const tolerancia = toleranciaTexto === "" ? 10 : Number(toleranciaTexto);
  if (!Number.isInteger(tolerancia) || tolerancia < 0 || tolerancia > TOLERANCIA_MAXIMA_MIN) {
    return { ok: false, error: `La tolerancia son minutos, de 0 a ${TOLERANCIA_MAXIMA_MIN}.` };
  }

  return {
    ok: true,
    datos: {
      nombre,
      apellido: apellido || null,
      cargo: cargo || null,
      fotoUrl: fotoUrl || null,
      haceAlmuerzo: formData.get("haceAlmuerzo") === "on",
      horaEntrada: horaEntrada || null,
      toleranciaMin: tolerancia,
      pin: pin || null,
    },
  };
}

function nombreDe(d: { nombre: string; apellido: string | null }): string {
  return [d.nombre, d.apellido].filter(Boolean).join(" ");
}

function esPinRepetido(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

function refrescarPantallas() {
  revalidatePath("/admin/asistencia");
  revalidatePath("/admin/asistencia/colaboradores");
}

/**
 * Sube la selfie en cuanto se saca, antes de guardar el formulario: así se ve enseguida. Si después se
 * cancela, la imagen queda sin usar en el almacenamiento (igual que con la foto del personal).
 */
export async function subirFotoDelColaborador(formData: FormData): Promise<ResultadoFotoColaborador> {
  await exigirPermiso("asistencia.gestionar");
  const archivo = formData.get("archivo");
  if (!(archivo instanceof File)) return { ok: false, error: "No se recibió ninguna imagen" };
  try {
    return { ok: true, url: await subirFotoAsistencia(archivo) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "No se pudo subir la foto" };
  }
}

export async function crearColaborador(formData: FormData): Promise<ResultadoColaborador> {
  const sesion = await exigirPermiso("asistencia.gestionar");
  const idLocal = await idLocalActual();
  const prisma = prismaDelLocal(idLocal);

  const leido = leerDatos(formData);
  if (!leido.ok) return leido;
  const { pin, ...datos } = leido.datos;
  if (!pin) return { ok: false, error: "Elegí un PIN de 4 a 6 números para esta persona." };
  if (!datos.fotoUrl) return { ok: false, error: "Sacale una selfie: es la foto de referencia para revisar sus marcaciones." };

  let creado: { id: string };
  try {
    creado = await prisma.colaborador.create({
      data: { storeId: idLocal, ...datos, pinClave: claveDePin(idLocal, pin) },
      select: { id: true },
    });
  } catch (err) {
    if (esPinRepetido(err)) return { ok: false, error: ERROR_PIN_REPETIDO };
    throw err;
  }

  await registrarBitacora(idLocal, sesion, {
    modulo: "asistencia",
    accion: "colaborador_creado",
    descripcion: `Dio de alta a ${nombreDe(datos)} en el registro de asistencia.`,
    entidad: "Colaborador",
    entidadId: creado.id,
    detalle: { cargo: datos.cargo, horaEntrada: datos.horaEntrada, haceAlmuerzo: datos.haceAlmuerzo },
  });

  refrescarPantallas();
  return { ok: true };
}

export async function actualizarColaborador(id: string, formData: FormData): Promise<ResultadoColaborador> {
  const sesion = await exigirPermiso("asistencia.gestionar");
  const idLocal = await idLocalActual();
  const prisma = prismaDelLocal(idLocal);

  const leido = leerDatos(formData);
  if (!leido.ok) return leido;
  const { pin, ...datos } = leido.datos;
  const activo = formData.get("activo") === "on";

  // Se lee primero (filtrado por local) para saber si existe y si cambió el estado.
  const anterior = await prisma.colaborador.findFirst({
    where: { id },
    select: { activo: true, fotoUrl: true, pinClave: true },
  });
  if (!anterior) return { ok: false, error: "No se encontró a esa persona." };
  if (!pin && anterior.pinClave === null) {
    return { ok: false, error: "Esta persona todavía no tiene PIN: elegile uno para que pueda marcar." };
  }

  try {
    await prisma.colaborador.updateMany({
      where: { id },
      data: {
        ...datos,
        // Si se quitó la foto sin poner otra, queda la que ya tenía: la de referencia nunca se pierde.
        fotoUrl: datos.fotoUrl ?? anterior.fotoUrl,
        activo,
        ...(pin ? { pinClave: claveDePin(idLocal, pin) } : {}),
      },
    });
  } catch (err) {
    if (esPinRepetido(err)) return { ok: false, error: ERROR_PIN_REPETIDO };
    throw err;
  }

  const nombre = nombreDe(datos);
  const cambioEstado = anterior.activo !== activo;
  await registrarBitacora(idLocal, sesion, {
    modulo: "asistencia",
    accion: cambioEstado
      ? activo
        ? "colaborador_activado"
        : "colaborador_desactivado"
      : pin
        ? "colaborador_pin_cambiado"
        : "colaborador_editado",
    descripcion: cambioEstado
      ? `${activo ? "Volvió a activar" : "Desactivó"} a ${nombre} en el registro de asistencia.`
      : pin
        ? `Cambió el PIN de ${nombre} en el registro de asistencia.`
        : `Editó los datos de ${nombre} en el registro de asistencia.`,
    entidad: "Colaborador",
    entidadId: id,
  });

  refrescarPantallas();
  return { ok: true };
}
