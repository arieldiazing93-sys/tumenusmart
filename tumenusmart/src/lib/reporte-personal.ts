/**
 * El reporte de movimiento del personal de la Reserva de turnos: los trabajos que terminó cada persona (citas
 * cobradas, con reserva o cobradas en el mostrador a alguien sin reserva) y lo que le toca de comisión en un
 * período. Lo comparten la pantalla del reporte y su descarga en Excel, para que digan siempre lo mismo.
 *
 * Cuenta por el día del trabajo (`Cita.inicio`), igual que Citas y la vista de cada persona. Lo que vale cada
 * trabajo es lo de sus servicios (`montoDelTrabajo`): los productos que se lleve el cliente en la misma cuenta no
 * suman. Cada trabajo usa el porcentaje que tenía quien lo hizo AL COBRARLO; los cobrados antes de existir la
 * comisión usan el que tiene ahora.
 */

import type { Prisma } from "@prisma/client";
import { horaDeMinutos, partesLocales } from "./agenda";
import { calcularComision, montoDelTrabajo, nombreCompleto } from "./agenda-personal";
import { claveSumarDias } from "./calendario";
import { detallePagos } from "./pago-venta";
import type { PrismaLocal } from "./prisma-local";
import { limitesEnAsuncion } from "./rango-dias";

/** El período más largo que se puede pedir de una vez. */
export const MAXIMO_DIAS_REPORTE = 366;

const DIA_MS = 24 * 60 * 60 * 1000;

/** Un día "YYYY-MM-DD" que existe de verdad ("2026-02-30" no), o null. */
export function diaValido(valor: string | undefined | null): string | null {
  if (!valor || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return null;
  return claveSumarDias(valor, 0) === valor ? valor : null;
}

export type PersonaReporte = {
  id: string;
  nombre: string;
  fotoUrl: string | null;
  activo: boolean;
  /** Su posición en la lista, para darle su color al avatar. */
  indice: number;
  /** Su comisión de hoy, en porcentaje; null si no cobra. */
  comision: number | null;
};

export type Acumulado = { cantidad: number; cobrado: number; comision: number };

/** Un trabajo terminado, ya con lo que le toca de comisión. */
export type FilaTrabajo = {
  id: string;
  personal: string;
  /** "YYYY-MM-DD" y "HH:MM" en hora de Asunción. */
  dia: string;
  hora: string;
  cliente: string;
  servicios: string | null;
  /** true si fue una venta del mostrador a alguien sin reserva. */
  sinReserva: boolean;
  pago: string;
  /** Lo que valen sus servicios (ya con el descuento que les tocó). */
  total: number;
  /** El porcentaje con que se calculó; null si no tenía comisión. */
  porcentaje: number | null;
  comision: number;
};

export type DatosReporte = {
  personas: PersonaReporte[];
  /** A quién se mira; null = todo el personal. */
  personalElegido: PersonaReporte | null;
  /** El período pedido (con las fechas ya en orden); null si todavía no se pidió ninguno. */
  periodo: { desde: string; hasta: string } | null;
  demasiadoLargo: boolean;
  porPersona: Map<string, Acumulado>;
  general: Acumulado;
  /** Los nombres de quienes hicieron trabajos pero todavía no tienen comisión cargada. */
  nombresSinComision: string[];
  filas: FilaTrabajo[];
  /** true si hay más trabajos que las filas que se traen (los totales igual cuentan todos). */
  hayMas: boolean;
};

/**
 * Arma el reporte. El reporte solo se arma cuando llegan las dos fechas; un id de persona que no es de este local
 * simplemente no filtra a nadie (se mira a todo el personal).
 *
 * `maximoFilas` acota el detalle; los totales cuentan siempre todo el período. `orden` es el del detalle: lo más
 * reciente primero en pantalla, cronológico en el Excel.
 */
export async function cargarReportePersonal(
  db: PrismaLocal,
  pedido: { personal?: string | null; desde?: string | null; hasta?: string | null },
  maximoFilas: number,
  orden: "desc" | "asc" = "desc"
): Promise<DatosReporte> {
  const equipo = await db.miembroPersonal.findMany({
    orderBy: [{ activo: "desc" }, { orden: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    select: { id: true, nombre: true, apellido: true, fotoUrl: true, activo: true, comisionPorcentaje: true },
  });
  const personas: PersonaReporte[] = equipo.map((p, indice) => ({
    id: p.id,
    nombre: nombreCompleto(p),
    fotoUrl: p.fotoUrl,
    activo: p.activo,
    indice,
    comision: p.comisionPorcentaje == null ? null : Number(p.comisionPorcentaje),
  }));
  const personaPorId = new Map(personas.map((p) => [p.id, p] as const));
  const personalElegido = personaPorId.get(pedido.personal ?? "") ?? null;

  let desde = diaValido(pedido.desde);
  let hasta = diaValido(pedido.hasta);
  if (desde !== null && hasta !== null && desde > hasta) [desde, hasta] = [hasta, desde];
  const periodo = desde !== null && hasta !== null ? { desde, hasta } : null;
  const dias = periodo ? Math.round((Date.parse(periodo.hasta) - Date.parse(periodo.desde)) / DIA_MS) + 1 : 0;
  const demasiadoLargo = dias > MAXIMO_DIAS_REPORTE;

  // Un trabajo terminado = una cita cobrada cuyo cobro no se anuló (con reserva o de mostrador).
  const donde: Prisma.CitaWhereInput | null =
    periodo && !demasiadoLargo
      ? {
          ...(personalElegido ? { personalId: personalElegido.id } : {}),
          inicio: limitesEnAsuncion(periodo),
          ventaPos: { is: { cancelada: false } },
        }
      : null;

  const [todos, detalle] = donde
    ? await Promise.all([
        // Todo el período, con lo mínimo: de acá salen los totales.
        db.cita.findMany({
          where: donde,
          select: { personalId: true, comisionPorcentaje: true, precio: true, ventaPos: { select: { total: true } } },
        }),
        // El detalle de cada trabajo.
        db.cita.findMany({
          where: donde,
          orderBy: [{ inicio: orden }, { id: "asc" }],
          take: maximoFilas,
          select: {
            id: true,
            personalId: true,
            clienteNombre: true,
            inicio: true,
            serviciosTexto: true,
            origen: true,
            comisionPorcentaje: true,
            precio: true,
            ventaPos: { select: { total: true, pagos: { orderBy: { orden: "asc" }, select: { forma: true, monto: true } } } },
          },
        }),
      ])
    : [[], []];

  /** El porcentaje de un trabajo: el que tenía al cobrarlo o, si no tenía, el que tiene la persona ahora. */
  function porcentajeDe(personalId: string, guardado: unknown): number | null {
    if (guardado != null) return Number(guardado);
    return personaPorId.get(personalId)?.comision ?? null;
  }

  const porPersona = new Map<string, Acumulado>();
  const general: Acumulado = { cantidad: 0, cobrado: 0, comision: 0 };
  const sinComision = new Set<string>();
  for (const c of todos) {
    const total = montoDelTrabajo(c.precio, c.ventaPos?.total);
    const porcentaje = porcentajeDe(c.personalId, c.comisionPorcentaje);
    if (porcentaje === null) sinComision.add(c.personalId);
    const comision = calcularComision(total, porcentaje);
    const previo = porPersona.get(c.personalId) ?? { cantidad: 0, cobrado: 0, comision: 0 };
    porPersona.set(c.personalId, {
      cantidad: previo.cantidad + 1,
      cobrado: previo.cobrado + total,
      comision: previo.comision + comision,
    });
    general.cantidad += 1;
    general.cobrado += total;
    general.comision += comision;
  }

  const filas: FilaTrabajo[] = detalle.map((c) => {
    const { dia, minutos } = partesLocales(c.inicio);
    const total = montoDelTrabajo(c.precio, c.ventaPos?.total);
    const porcentaje = porcentajeDe(c.personalId, c.comisionPorcentaje);
    return {
      id: c.id,
      personal: personaPorId.get(c.personalId)?.nombre ?? "—",
      dia,
      hora: horaDeMinutos(minutos),
      cliente: c.clienteNombre,
      servicios: c.serviciosTexto,
      sinReserva: c.origen === "mostrador",
      pago: c.ventaPos ? detallePagos(c.ventaPos.pagos.map((p) => ({ forma: p.forma, monto: Number(p.monto) }))) : "—",
      total,
      porcentaje,
      comision: calcularComision(total, porcentaje),
    };
  });

  return {
    personas,
    personalElegido,
    periodo,
    demasiadoLargo,
    porPersona,
    general,
    nombresSinComision: personas.filter((p) => sinComision.has(p.id)).map((p) => p.nombre),
    filas,
    hayMas: general.cantidad > filas.length,
  };
}
