"use server";

import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { exigirPermiso } from "@/lib/auth";
import { AVISO_PIN_FACIL, pinDemasiadoFacil } from "@/lib/asistencia";
import { pinDeMozoValido } from "@/lib/comedor";
import { registrarBitacora } from "@/lib/bitacora";
import { idLocalActual } from "@/lib/local-actual";
import { prisma } from "@/lib/prisma";
import { prismaDelLocal } from "@/lib/prisma-local";
import { claveDePinMozo } from "@/lib/sesion-mozo";

export type ResultadoMozo = { ok: true } | { ok: false; error: string };

const LARGO_MAXIMO = 60;
const ERROR_PIN_REPETIDO =
  "Ese PIN ya lo usa otro mozo (o uno inactivo). Elegí otro: con 3 números pasa más seguido, probá con otros tres de su cédula o teléfono, o agregale un número.";

function texto(valor: FormDataEntryValue | null): string {
  return String(valor ?? "").trim();
}

function nombreDe(d: { nombre: string; apellido: string | null }): string {
  return [d.nombre, d.apellido].filter(Boolean).join(" ");
}

function esPinRepetido(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

function refrescar() {
  revalidatePath("/admin/comedor/mozos");
}

/**
 * Activa el enlace del Servicio comedor, o saca una llave nueva si ya había una: el enlace anterior deja de funcionar al
 * instante (sirve si una tablet se perdió o el enlace se lo pasaron a quien no debía). La llave son 24 bytes al azar —
 * imposible de adivinar— y se guarda en el propio local (Store no está entre los modelos filtrados por local, por eso va
 * con el cliente sin filtro y el id del local de la sesión).
 */
export async function generarEnlaceMozos(): Promise<ResultadoMozo> {
  const sesion = await exigirPermiso("comedor.configurar");
  const idLocal = await idLocalActual();

  const anterior = await prisma.store.findUnique({ where: { id: idLocal }, select: { tokenMozos: true } });
  const token = randomBytes(24).toString("base64url");
  await prisma.store.update({ where: { id: idLocal }, data: { tokenMozos: token } });

  await registrarBitacora(idLocal, sesion, {
    modulo: "comedor",
    accion: anterior?.tokenMozos ? "enlace_regenerado" : "enlace_activado",
    descripcion: anterior?.tokenMozos
      ? "Generó un enlace nuevo para los mozos: el anterior dejó de funcionar."
      : "Activó el enlace de los mozos.",
    entidad: "Store",
    entidadId: idLocal,
  });

  refrescar();
  return { ok: true };
}

/** Apaga el enlace: nadie puede entrar como mozo hasta que se vuelva a activar. */
export async function apagarEnlaceMozos(): Promise<ResultadoMozo> {
  const sesion = await exigirPermiso("comedor.configurar");
  const idLocal = await idLocalActual();

  await prisma.store.update({ where: { id: idLocal }, data: { tokenMozos: null } });

  await registrarBitacora(idLocal, sesion, {
    modulo: "comedor",
    accion: "enlace_apagado",
    descripcion: "Apagó el enlace de los mozos.",
    entidad: "Store",
    entidadId: idLocal,
  });

  refrescar();
  return { ok: true };
}

type DatosMozo = { nombre: string; apellido: string | null; pin: string | null };

/** Lee y valida lo que mandó el formulario. Nunca se guarda lo que llega tal cual. */
function leerDatos(formData: FormData): { ok: true; datos: DatosMozo } | { ok: false; error: string } {
  const nombre = texto(formData.get("nombre"));
  if (!nombre) return { ok: false, error: "El nombre es obligatorio" };
  const apellido = texto(formData.get("apellido"));
  if (nombre.length > LARGO_MAXIMO || apellido.length > LARGO_MAXIMO) {
    return { ok: false, error: `El nombre y el apellido pueden tener hasta ${LARGO_MAXIMO} letras` };
  }
  const pin = texto(formData.get("pin"));
  if (pin && !pinDeMozoValido(pin)) return { ok: false, error: "El PIN tiene que ser de 3 a 5 números (solo números)." };
  if (pin && pinDemasiadoFacil(pin)) return { ok: false, error: AVISO_PIN_FACIL };
  return { ok: true, datos: { nombre, apellido: apellido || null, pin: pin || null } };
}

export async function crearMozo(formData: FormData): Promise<ResultadoMozo> {
  const sesion = await exigirPermiso("comedor.configurar");
  const idLocal = await idLocalActual();
  const db = prismaDelLocal(idLocal);

  const leido = leerDatos(formData);
  if (!leido.ok) return leido;
  const { pin, ...datos } = leido.datos;
  if (!pin) return { ok: false, error: "Elegí un PIN de 3 a 5 números para este mozo." };

  let creado: { id: string };
  try {
    creado = await db.mozo.create({
      data: { storeId: idLocal, ...datos, pinClave: claveDePinMozo(idLocal, pin) },
      select: { id: true },
    });
  } catch (err) {
    if (esPinRepetido(err)) return { ok: false, error: ERROR_PIN_REPETIDO };
    throw err;
  }

  await registrarBitacora(idLocal, sesion, {
    modulo: "comedor",
    accion: "mozo_creado",
    descripcion: `Dio de alta al mozo ${nombreDe(datos)}.`,
    entidad: "Mozo",
    entidadId: creado.id,
  });

  refrescar();
  return { ok: true };
}

export async function actualizarMozo(id: string, formData: FormData): Promise<ResultadoMozo> {
  const sesion = await exigirPermiso("comedor.configurar");
  const idLocal = await idLocalActual();
  const db = prismaDelLocal(idLocal);

  const leido = leerDatos(formData);
  if (!leido.ok) return leido;
  const { pin, ...datos } = leido.datos;
  const activo = formData.get("activo") === "on";

  // Se lee primero (filtrado por local) para saber si existe y si cambió el estado.
  const anterior = await db.mozo.findFirst({ where: { id }, select: { activo: true, pinClave: true } });
  if (!anterior) return { ok: false, error: "No se encontró a ese mozo." };
  if (!pin && anterior.pinClave === null) {
    return { ok: false, error: "Este mozo todavía no tiene PIN: elegile uno para que pueda entrar." };
  }

  try {
    await db.mozo.updateMany({
      where: { id },
      data: { ...datos, activo, ...(pin ? { pinClave: claveDePinMozo(idLocal, pin) } : {}) },
    });
  } catch (err) {
    if (esPinRepetido(err)) return { ok: false, error: ERROR_PIN_REPETIDO };
    throw err;
  }

  const nombre = nombreDe(datos);
  const cambioEstado = anterior.activo !== activo;
  await registrarBitacora(idLocal, sesion, {
    modulo: "comedor",
    accion: cambioEstado ? (activo ? "mozo_activado" : "mozo_desactivado") : pin ? "mozo_pin_cambiado" : "mozo_editado",
    descripcion: cambioEstado
      ? `${activo ? "Volvió a activar" : "Desactivó"} al mozo ${nombre}.`
      : pin
        ? `Cambió el PIN del mozo ${nombre}.`
        : `Editó los datos del mozo ${nombre}.`,
    entidad: "Mozo",
    entidadId: id,
  });

  refrescar();
  return { ok: true };
}
