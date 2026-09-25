/**
 * Lo que necesita la reserva pública para consultar la base: la página del
 * negocio, sus servicios, su personal y los turnos que ya ocupan horario.
 *
 * Esto corre en el servidor y SIN sesión (el cliente no tiene cuenta), así que
 * cada consulta lleva el local explícito: el local sale de la dirección de la
 * página, nunca de algo que mande el navegador.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import { partesLocales } from "./agenda";
import { nombreCompleto } from "./agenda-personal";
import { claveSumarDias } from "./calendario";
import {
  DIAS_ADELANTE,
  MINUTOS_BLOQUEO_SIN_CONFIRMAR,
  horasDelPeriodo,
  type Ocupado,
} from "./disponibilidad";
import { completarHorario } from "./horario-trabajo";
import { estaSuspendido } from "./local-por-slug";
import { prisma } from "./prisma";
import { MAX_SERVICIOS_POR_CITA, type PersonalPublico, type ServicioPublico } from "./reserva-cliente";
import { normalizarTipoPrecio } from "./servicios-agenda";
import { claveDiaAsuncion, fechaAsuncionDesdeTexto } from "./timezone";

type Db = PrismaClient | Prisma.TransactionClient;

/** La página de reservas de esa dirección, solo si está habilitada y el negocio en regla. */
export async function cargarPaginaPublica(slug: string) {
  const pagina = await prisma.paginaReservas.findUnique({
    where: { slug: slug.toLowerCase() },
    include: { store: { select: { estado: true, vencimiento: true } } },
  });
  if (!pagina || !pagina.habilitada || estaSuspendido(pagina.store)) return null;
  return pagina;
}

export type ServicioReservable = ServicioPublico & {
  categoryId: string;
  categoriaNombre: string;
  categoriaOrden: number;
};

/**
 * Los servicios que se pueden reservar: disponibles, de una categoría de
 * servicios y con al menos un profesional activo que los realice.
 */
export async function cargarServiciosReservables(
  db: Db,
  storeId: string,
  ids?: string[]
): Promise<ServicioReservable[]> {
  const filas = await db.servicioAgenda.findMany({
    where: {
      storeId,
      ...(ids ? { id: { in: ids } } : {}),
      product: { disponible: true, esServicio: true, category: { paraServicios: true } },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      duracionMin: true,
      bufferMin: true,
      tipoPrecio: true,
      product: {
        select: { nombre: true, precio: true, category: { select: { id: true, nombre: true, orden: true } } },
      },
      personal: { select: { personalId: true, personal: { select: { activo: true } } } },
    },
  });

  return filas
    .map((f) => ({
      id: f.id,
      nombre: f.product.nombre,
      duracionMin: f.duracionMin,
      bufferMin: f.bufferMin,
      precio: Number(f.product.precio),
      tipoPrecio: normalizarTipoPrecio(f.tipoPrecio),
      personalIds: f.personal.filter((p) => p.personal.activo).map((p) => p.personalId),
      categoryId: f.product.category.id,
      categoriaNombre: f.product.category.nombre,
      categoriaOrden: f.product.category.orden,
    }))
    .filter((s) => s.personalIds.length > 0);
}

/** El personal activo del negocio, para mostrar. */
export async function cargarPersonalPublico(db: Db, storeId: string, ids?: string[]): Promise<PersonalPublico[]> {
  const filas = await db.miembroPersonal.findMany({
    where: { storeId, activo: true, ...(ids ? { id: { in: ids } } : {}) },
    orderBy: [{ orden: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    select: { id: true, nombre: true, apellido: true, profesion: true, fotoUrl: true },
  });
  return filas.map((f) => ({
    id: f.id,
    nombre: nombreCompleto(f),
    profesion: f.profesion,
    fotoUrl: f.fotoUrl,
  }));
}

/**
 * Lo que eligió el cliente, ya verificado contra la base: los servicios existen y
 * se pueden reservar, y hay al menos un profesional que los realiza a todos.
 */
export type SeleccionResuelta = {
  servicios: ServicioReservable[];
  /** Los profesionales que realizan TODOS los servicios elegidos. */
  personalIds: string[];
  /** Suma de las duraciones, en minutos. */
  duracion: number;
  /** El mayor tiempo de búfer de los servicios: se limpia una sola vez al final. */
  buffer: number;
  total: number;
};

export async function resolverSeleccion(
  db: Db,
  storeId: string,
  servicioIds: unknown
): Promise<{ ok: true; seleccion: SeleccionResuelta } | { ok: false; error: string }> {
  const ids = Array.isArray(servicioIds)
    ? [...new Set(servicioIds.filter((x): x is string => typeof x === "string"))]
    : [];
  if (ids.length === 0) return { ok: false, error: "Elegí al menos un servicio" };
  if (ids.length > MAX_SERVICIOS_POR_CITA) {
    return { ok: false, error: `Podés elegir hasta ${MAX_SERVICIOS_POR_CITA} servicios por cita` };
  }

  const cargados = await cargarServiciosReservables(db, storeId, ids);
  if (cargados.length !== ids.length) {
    return { ok: false, error: "Alguno de los servicios ya no está disponible. Volvé a elegir." };
  }
  // En el orden en que los eligió.
  const servicios = ids.map((id) => cargados.find((s) => s.id === id) as ServicioReservable);

  const personalIds = servicios[0].personalIds.filter((p) => servicios.every((s) => s.personalIds.includes(p)));
  if (personalIds.length === 0) {
    return { ok: false, error: "Ningún profesional realiza todos esos servicios juntos. Elegí menos servicios." };
  }

  return {
    ok: true,
    seleccion: {
      servicios,
      personalIds,
      duracion: servicios.reduce((s, x) => s + x.duracionMin, 0),
      buffer: Math.max(...servicios.map((s) => s.bufferMin)),
      total: servicios.reduce((s, x) => s + x.precio, 0),
    },
  };
}

/**
 * Los tramos ocupados de cada profesional, por día. Cuentan los turnos que no
 * están cancelados ni con inasistencia y que ya se ven en el calendario o se
 * pidieron hace poco (un turno web sin confirmar reserva el horario un rato).
 */
export async function ocupadosPorPersonal(
  db: Db,
  storeId: string,
  personalIds: string[],
  hoy: string,
  ahora: Date
): Promise<Map<string, Map<string, Ocupado[]>>> {
  const desde = fechaAsuncionDesdeTexto(hoy) as Date;
  const hasta = fechaAsuncionDesdeTexto(claveSumarDias(hoy, DIAS_ADELANTE + 1)) as Date;
  const limiteSinConfirmar = new Date(ahora.getTime() - MINUTOS_BLOQUEO_SIN_CONFIRMAR * 60_000);

  const citas = await db.cita.findMany({
    where: {
      storeId,
      personalId: { in: personalIds },
      inicio: { gte: desde, lt: hasta },
      estado: { notIn: ["cancelada", "no_asistio"] },
      // Lo cobrado en el mostrador sin reserva ya pasó: no ocupa agenda.
      origen: { not: "mostrador" },
      OR: [{ visible: true }, { createdAt: { gt: limiteSinConfirmar } }],
    },
    select: { personalId: true, inicio: true, fin: true, bufferMin: true },
  });

  const porPersonal = new Map<string, Map<string, Ocupado[]>>();
  for (const c of citas) {
    const i = partesLocales(c.inicio);
    const f = partesLocales(c.fin);
    const hastaMin = (f.dia === i.dia ? f.minutos : 24 * 60) + c.bufferMin;
    const porDia = porPersonal.get(c.personalId) ?? new Map<string, Ocupado[]>();
    const lista = porDia.get(i.dia) ?? [];
    lista.push({ desde: i.minutos, hasta: hastaMin });
    porDia.set(i.dia, lista);
    porPersonal.set(c.personalId, porDia);
  }
  return porPersonal;
}

/**
 * Las horas libres de cada profesional para esa selección, en los próximos días:
 * `personalId → { "2026-09-25": [540, 555, …] }`.
 */
export async function disponibilidadDePersonal(
  db: Db,
  storeId: string,
  seleccion: SeleccionResuelta,
  personalIds: string[],
  ahora: Date
): Promise<Map<string, Record<string, number[]>>> {
  const filas = await db.horarioTrabajo.findMany({
    where: { storeId },
    select: {
      diaSemana: true,
      trabaja: true,
      inicio: true,
      fin: true,
      descansa: true,
      descansoInicio: true,
      descansoFin: true,
    },
  });
  // Sin horario guardado se usa el de ejemplo (lunes a sábado de 9 a 18, descanso de 13 a 14).
  const horarios = completarHorario(filas);
  const hoy = claveDiaAsuncion(ahora);
  const minutosAhora = partesLocales(ahora).minutos;
  const ocupados = await ocupadosPorPersonal(db, storeId, personalIds, hoy, ahora);

  const salida = new Map<string, Record<string, number[]>>();
  for (const id of personalIds) {
    salida.set(
      id,
      horasDelPeriodo({
        horarios,
        ocupadosPorDia: ocupados.get(id) ?? new Map<string, Ocupado[]>(),
        duracion: seleccion.duracion,
        buffer: seleccion.buffer,
        hoy,
        minutosAhora,
      })
    );
  }
  return salida;
}
