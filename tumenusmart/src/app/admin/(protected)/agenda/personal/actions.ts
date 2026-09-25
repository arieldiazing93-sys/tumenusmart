"use server";

import { revalidatePath } from "next/cache";
import { exigirPermiso } from "@/lib/auth";
import { registrarBitacora } from "@/lib/bitacora";
import { idLocalActual } from "@/lib/local-actual";
import { prisma as prismaGlobal } from "@/lib/prisma";
import { prismaDelLocal } from "@/lib/prisma-local";
import { horaDeMinutos, partesLocales } from "@/lib/agenda";
import {
  PERIODOS_COMISION,
  calcularComision,
  leerComision,
  nombreCompleto,
  normalizarTelefonoPersonal,
  type PeriodoComision,
  type TrabajoDelPersonal,
} from "@/lib/agenda-personal";
import { calcularRangoFecha } from "@/lib/rango-fecha";
import { subirFotoPersonal } from "@/lib/supabase-storage";

export type ResultadoPersonal = { ok: true } | { ok: false; error: string };
export type ResultadoFotoPersonal = { ok: true; url: string } | { ok: false; error: string };
export type ResultadoTrabajos =
  | {
      ok: true;
      /** La comisión que tiene ahora la persona; null si no cobra. */
      comisionActual: number | null;
      trabajos: TrabajoDelPersonal[];
      totalCobrado: number;
      totalComision: number;
      /** true si hay más trabajos de los que se muestran (se acota el período). */
      hayMas: boolean;
    }
  | { ok: false; error: string };

/** Tope de trabajos que se listan de una vez en el reporte. */
const MAXIMO_TRABAJOS = 300;

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
  comisionPorcentaje: number | null;
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

  // La comisión por trabajo: vacío = no cobra comisión.
  const comision = leerComision(texto(formData.get("comision")));
  if (!comision.ok) return { ok: false, error: comision.error };

  return {
    ok: true,
    datos: {
      nombre,
      apellido,
      telefono: telefono.telefono,
      profesion: profesion || null,
      fotoUrl: fotoUrl || null,
      comisionPorcentaje: comision.valor,
    },
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

/**
 * El reporte de trabajos de una persona: las citas que ya cobró (o sea, los trabajos
 * terminados) en el período elegido y lo que le toca de comisión por cada una.
 *
 * Cada cita usa el porcentaje que tenía la persona AL COBRARLA (así cambiar la comisión
 * después no mueve lo que ya ganó); las citas cobradas antes de que existiera la comisión
 * usan la que tiene ahora. Solo cuentan las cobradas cuyo cobro no se anuló.
 */
export async function trabajosDelPersonal(id: string, periodo: PeriodoComision): Promise<ResultadoTrabajos> {
  await exigirPermiso("agenda.configurar");
  const db = prismaDelLocal(await idLocalActual());

  if (!PERIODOS_COMISION.some((p) => p.valor === periodo)) {
    return { ok: false, error: "El período no es válido." };
  }
  const rango = calcularRangoFecha(periodo, undefined, undefined);
  if (!rango) return { ok: false, error: "El período no es válido." };

  const persona = await db.miembroPersonal.findFirst({ where: { id }, select: { comisionPorcentaje: true } });
  if (!persona) return { ok: false, error: "No se encontró a esa persona." };
  const comisionActual = persona.comisionPorcentaje == null ? null : Number(persona.comisionPorcentaje);

  const citas = await db.cita.findMany({
    where: {
      personalId: id,
      inicio: { gte: rango.gte, lt: rango.lt },
      ventaPos: { is: { cancelada: false } },
    },
    orderBy: [{ inicio: "desc" }, { id: "asc" }],
    take: MAXIMO_TRABAJOS,
    select: {
      id: true,
      clienteNombre: true,
      inicio: true,
      serviciosTexto: true,
      comisionPorcentaje: true,
      ventaPos: { select: { total: true } },
    },
  });

  const trabajos: TrabajoDelPersonal[] = citas.map((c) => {
    const { dia, minutos } = partesLocales(c.inicio);
    const total = Number(c.ventaPos?.total ?? 0);
    const porcentaje = c.comisionPorcentaje == null ? comisionActual : Number(c.comisionPorcentaje);
    return {
      id: c.id,
      dia,
      hora: horaDeMinutos(minutos),
      cliente: c.clienteNombre,
      servicios: c.serviciosTexto,
      total,
      porcentaje,
      comision: calcularComision(total, porcentaje),
    };
  });

  return {
    ok: true,
    comisionActual,
    trabajos,
    totalCobrado: trabajos.reduce((suma, t) => suma + t.total, 0),
    totalComision: trabajos.reduce((suma, t) => suma + t.comision, 0),
    hayMas: citas.length >= MAXIMO_TRABAJOS,
  };
}

/**
 * Prende o apaga "preguntar el personal al cobrar en el punto de venta": para los negocios donde
 * llega gente sin reserva (barberías, salones), el punto de venta pregunta a quién se le asigna el
 * trabajo. Es una opción del local (Store.pedirPersonalEnVenta); apagada, los demás negocios no
 * ven nada del personal en el punto de venta. Se guarda al instante.
 */
export async function alternarPedirPersonalEnVenta(activo: boolean): Promise<ResultadoPersonal> {
  const sesion = await exigirPermiso("agenda.configurar");
  const idLocal = await idLocalActual();

  await prismaGlobal.store.update({
    where: { id: idLocal },
    data: { pedirPersonalEnVenta: activo === true },
  });

  await registrarBitacora(idLocal, sesion, {
    modulo: "configuracion",
    accion: activo ? "pedir_personal_en_venta_activado" : "pedir_personal_en_venta_desactivado",
    descripcion: activo
      ? 'Activó "Preguntar el personal al cobrar": el punto de venta pregunta a quién se le asigna el trabajo.'
      : 'Desactivó "Preguntar el personal al cobrar".',
    entidad: "Store",
    entidadId: idLocal,
  });

  revalidatePath("/admin/pos");
  revalidatePath("/admin/agenda/personal");
  return { ok: true };
}
