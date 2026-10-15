"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { exigirPermiso } from "@/lib/auth";
import { AVISO_PIN_FACIL, horaValida, normalizarMetodoAsistencia, pinDemasiadoFacil, pinNuevoValido } from "@/lib/asistencia";
import { claveDePin } from "@/lib/asistencia-servidor";
import { diasTrabajoValidos, esFormaDePago, type FormaDePago } from "@/lib/ausencias";
import { rostroValido } from "@/lib/reconocimiento-facial";
import { registrarBitacora } from "@/lib/bitacora";
import { descartarImagenes } from "@/lib/imagenes";
import { idLocalActual } from "@/lib/local-actual";
import { prisma as prismaGlobal } from "@/lib/prisma";
import { prismaDelLocal } from "@/lib/prisma-local";
import { subirFotoAsistencia } from "@/lib/supabase-storage";

export type ResultadoColaborador = { ok: true } | { ok: false; error: string };
export type ResultadoFotoColaborador = { ok: true; url: string } | { ok: false; error: string };

const LARGO_MAXIMO_TEXTO = 60;
const TOLERANCIA_MAXIMA_MIN = 120;
/** Un salario o jornal más alto que esto es un error de tipeo (999.999.999 Gs). */
const MONTO_MAXIMO_PAGO = 999_999_999;
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
  /** Los días de la semana que tiene que ir (0 = domingo … 6 = sábado). Al menos uno. */
  diasTrabajo: number[];
  /** Cómo se le paga; NULL = todavía sin definir. */
  tipoPago: FormaDePago | null;
  /** Guaraníes: el salario del mes (mensual) o el monto por día (jornal). 0 si no hay forma de pago. */
  montoPago: number;
  /** El PIN nuevo, en claro, solo si se escribió uno (se guarda su huella, nunca el PIN). */
  pin: string | null;
  /** El rostro (128 números) que sacó el navegador de la selfie nueva, solo si se sacó una. */
  rostro: number[] | null;
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

  // El rostro lo calcula el navegador al sacar la selfie; acá solo se comprueba que sea un rostro posible (128 números razonables).
  const rostroTexto = texto(formData.get("rostro"));
  const rostro = rostroTexto ? rostroValido(rostroTexto) : null;
  if (rostroTexto && !rostro) return { ok: false, error: "El rostro de la selfie no es válido. Sacala de nuevo." };

  const pin = texto(formData.get("pin"));
  if (pin && !pinNuevoValido(pin)) return { ok: false, error: "El PIN tiene que ser de 3 números." };
  if (pin && pinDemasiadoFacil(pin)) return { ok: false, error: AVISO_PIN_FACIL };

  const horaEntrada = texto(formData.get("horaEntrada"));
  if (horaEntrada && !horaValida(horaEntrada)) return { ok: false, error: "La hora de entrada no es válida." };

  const toleranciaTexto = texto(formData.get("toleranciaMin"));
  const tolerancia = toleranciaTexto === "" ? 10 : Number(toleranciaTexto);
  if (!Number.isInteger(tolerancia) || tolerancia < 0 || tolerancia > TOLERANCIA_MAXIMA_MIN) {
    return { ok: false, error: `La tolerancia son minutos, de 0 a ${TOLERANCIA_MAXIMA_MIN}.` };
  }

  // Los días que tiene que ir: llegan como "1,2,3,4,5,6". Sin al menos uno no se puede saber cuándo faltó.
  const diasTexto = texto(formData.get("diasTrabajo"));
  const diasTrabajo = diasTrabajoValidos(diasTexto.split(",").filter((d) => d !== ""));
  if (!diasTrabajo) return { ok: false, error: "Marcá al menos un día de trabajo." };

  // Cómo se le paga: opcional, pero si se elige hace falta el monto.
  const formaTexto = texto(formData.get("tipoPago"));
  if (formaTexto && !esFormaDePago(formaTexto)) return { ok: false, error: "La forma de pago no es válida." };
  const tipoPago: FormaDePago | null = formaTexto ? (formaTexto as FormaDePago) : null;
  const montoTexto = texto(formData.get("montoPago")).replace(/\D/g, "");
  const montoPago = tipoPago && montoTexto ? Number(montoTexto) : 0;
  if (tipoPago && montoPago <= 0) {
    return {
      ok: false,
      error: tipoPago === "mensual" ? "Poné cuánto es su salario del mes." : "Poné cuánto se le paga por día.",
    };
  }
  if (montoPago > MONTO_MAXIMO_PAGO) return { ok: false, error: "Ese monto es demasiado grande." };

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
      diasTrabajo,
      tipoPago,
      montoPago,
      pin: pin || null,
      rostro,
    },
  };
}

function nombreDe(d: { nombre: string; apellido: string | null }): string {
  return [d.nombre, d.apellido].filter(Boolean).join(" ");
}

function esPinRepetido(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

/** Cómo se marca en este local ahora (Store no es un modelo por local: se lee con el cliente global y el id de la sesión). */
async function metodoDelLocal(idLocal: string) {
  const local = await prismaGlobal.store.findUnique({ where: { id: idLocal }, select: { metodoAsistencia: true } });
  return normalizarMetodoAsistencia(local?.metodoAsistencia);
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
  const { pin, rostro, ...datos } = leido.datos;
  if (!pin) return { ok: false, error: "Elegí un PIN de 3 números para esta persona." };
  const soloPin = (await metodoDelLocal(idLocal)) === "pin";
  // Con cámara la selfie es obligatoria; con solo PIN, opcional (si la trae, igual se guarda su rostro).
  if (!datos.fotoUrl && !soloPin) {
    return { ok: false, error: "Sacale una selfie: es la foto de referencia para revisar sus marcaciones." };
  }
  // Sin rostro el celular no podría comprobar que sea esta persona: se registra desde la selfie del alta.
  if (!rostro && !soloPin) {
    return { ok: false, error: "No se registró el rostro de esta persona. Sacale la selfie de nuevo, de frente y con buena luz." };
  }

  let creado: { id: string };
  try {
    creado = await prisma.colaborador.create({
      data: {
        storeId: idLocal,
        ...datos,
        diasTrabajo: { set: datos.diasTrabajo },
        pinClave: claveDePin(idLocal, pin),
        rostro: { set: rostro ?? [] },
        rostroRegistradoEn: rostro ? new Date() : null,
      },
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
    detalle: {
      cargo: datos.cargo,
      horaEntrada: datos.horaEntrada,
      haceAlmuerzo: datos.haceAlmuerzo,
      diasTrabajo: datos.diasTrabajo,
      tipoPago: datos.tipoPago,
      montoPago: datos.montoPago,
      rostroRegistrado: !!rostro,
    },
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
  const { pin, rostro, ...datos } = leido.datos;
  const activo = formData.get("activo") === "on";

  // Se lee primero (filtrado por local) para saber si existe y si cambió el estado.
  const anterior = await prisma.colaborador.findFirst({
    where: { id },
    select: { activo: true, fotoUrl: true, pinClave: true, diasTrabajo: true, tipoPago: true, montoPago: true },
  });
  if (!anterior) return { ok: false, error: "No se encontró a esa persona." };
  if (!pin && anterior.pinClave === null) {
    return { ok: false, error: "Esta persona todavía no tiene PIN: elegile uno para que pueda marcar." };
  }
  // Una selfie nueva trae su rostro nuevo: si cambió la foto de referencia y no llegó el rostro, el guardado quedaría de otra
  // foto (de otra cara, si se cambió a otra persona) y el celular compararía contra eso. Con solo PIN no hace falta rostro: se
  // vacía el que había (quedaría de la foto anterior) y se avisa en la ficha que falta registrarlo si algún día se marca con cámara.
  const soloPin = (await metodoDelLocal(idLocal)) === "pin";
  const fotoCambio = !!datos.fotoUrl && datos.fotoUrl !== anterior.fotoUrl;
  if (fotoCambio && !rostro && !soloPin) {
    return { ok: false, error: "Cambiaste la foto: hace falta registrar el rostro de la nueva. Sacala de nuevo, de frente y con buena luz." };
  }
  try {
    await prisma.colaborador.updateMany({
      where: { id },
      data: {
        ...datos,
        diasTrabajo: { set: datos.diasTrabajo },
        // Si se quitó la foto sin poner otra, queda la que ya tenía: la de referencia nunca se pierde.
        fotoUrl: datos.fotoUrl ?? anterior.fotoUrl,
        activo,
        ...(pin ? { pinClave: claveDePin(idLocal, pin) } : {}),
        ...(rostro
          ? { rostro: { set: rostro }, rostroRegistradoEn: new Date() }
          : fotoCambio && soloPin
            ? { rostro: { set: [] as number[] }, rostroRegistradoEn: null }
            : {}),
      },
    });
  } catch (err) {
    if (esPinRepetido(err)) return { ok: false, error: ERROR_PIN_REPETIDO };
    throw err;
  }

  // La selfie de referencia anterior ya no se usa si se cambió por otra (si se quitó sin poner otra, se conserva la que había).
  if (datos.fotoUrl && anterior.fotoUrl && datos.fotoUrl !== anterior.fotoUrl) {
    await descartarImagenes([anterior.fotoUrl]);
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
  // Lo que se le paga y los días que trabaja mueven plata (descuentos por faltas): si cambian, queda anotado antes y después.
  const cambioPago = anterior.tipoPago !== datos.tipoPago || anterior.montoPago !== datos.montoPago;
  const cambioDias = anterior.diasTrabajo.join(",") !== datos.diasTrabajo.join(",");
  if (cambioPago || cambioDias) {
    await registrarBitacora(idLocal, sesion, {
      modulo: "asistencia",
      accion: cambioPago ? "colaborador_pago_cambiado" : "colaborador_dias_cambiados",
      descripcion: cambioPago
        ? `Cambió la forma de pago de ${nombre}: de ${anterior.tipoPago ?? "sin definir"} (Gs. ${anterior.montoPago}) a ${
            datos.tipoPago ?? "sin definir"
          } (Gs. ${datos.montoPago}).`
        : `Cambió los días de trabajo de ${nombre}.`,
      entidad: "Colaborador",
      entidadId: id,
      detalle: {
        antes: { tipoPago: anterior.tipoPago, montoPago: anterior.montoPago, diasTrabajo: anterior.diasTrabajo },
        despues: { tipoPago: datos.tipoPago, montoPago: datos.montoPago, diasTrabajo: datos.diasTrabajo },
      },
    });
  }
  if (rostro) {
    await registrarBitacora(idLocal, sesion, {
      modulo: "asistencia",
      accion: "colaborador_rostro_registrado",
      descripcion: `Registró el rostro de ${nombre} (con el que el celular fijo comprueba que sea esa persona al marcar).`,
      entidad: "Colaborador",
      entidadId: id,
    });
  }

  refrescarPantallas();
  return { ok: true };
}
