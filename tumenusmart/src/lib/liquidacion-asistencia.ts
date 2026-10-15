/**
 * La liquidación del personal del Registro de asistencia, armada en UN solo lugar: la pantalla, el Excel y el PDF la piden acá, así
 * los tres muestran exactamente los mismos números (mismo criterio que src/lib/reporte-asistencia.ts).
 *
 * Por cada persona: qué días tenía que ir, cuáles fue, cuáles faltó (con aviso o sin él), y de ahí lo que le corresponde según
 * cómo se le paga (mensual o jornal). Las cuentas puras están en src/lib/ausencias.ts. Esto NO paga nada: es el cálculo.
 *
 * Recibe el cliente ya filtrado por local (`prismaDelLocal`): nunca ve datos de otro negocio.
 */

import { diaLargo, parsearFecha } from "./agenda";
import {
  clasificarDias,
  diasEntre,
  esFormaDePago,
  etiquetaDeAusencia,
  liquidar,
  normalizarDiasTrabajo,
  resumirDias,
  type AusenciaRango,
  type EstadoDia,
  type FormaDePago,
  type Liquidacion,
  type ResumenDias,
} from "./ausencias";
import { nombreDeColaborador } from "./asistencia";
import { claveSumarDias } from "./calendario";
import type { PrismaLocal } from "./prisma-local";
import { calcularRangoFecha, type FiltroFecha } from "./rango-fecha";
import { claveDiaAsuncion } from "./timezone";

/** Cuántos días como máximo se liquidan de una vez. */
export const DIAS_MAXIMOS_LIQUIDACION = 62;
/** Tope de marcaciones que se leen: con 75 personas y 4 marcas por día, 62 días son ~18.600. */
const MARCACIONES_MAXIMAS_LIQUIDACION = 30000;

/** Un día del detalle de una persona (solo los que importan para la cuenta: se omiten los de descanso y los que no se controlan). */
export type DiaDetalleLiquidacion = {
  dia: string;
  diaTexto: string;
  estado: Exclude<EstadoDia, "descanso" | "sin_control" | "futuro">;
  /** "Trabajó", "Falta sin aviso", "Reposo médico (se paga)"... */
  etiqueta: string;
  /** Cómo cuenta en la plata: "se paga", "se descuenta" o "no cuenta todavía". */
  efecto: "paga" | "descuenta" | "neutro";
  nota: string | null;
  /** Solo si llegó tarde ese día: cuántos minutos. */
  tardanzaMin: number | null;
};

export type FilaLiquidacion = {
  id: string;
  nombre: string;
  cargo: string | null;
  activo: boolean;
  diasTrabajo: number[];
  forma: FormaDePago | null;
  monto: number;
  resumen: ResumenDias;
  /** Cuántas veces llegó tarde y cuántos minutos en total (informativo: no descuenta). */
  tardanzas: number;
  minutosTarde: number;
  liquidacion: Liquidacion;
  /** true = todavía no tiene forma de pago y monto: no se puede calcular lo que le toca. */
  sinFormaDePago: boolean;
  detalle: DiaDetalleLiquidacion[];
};

export type ReporteLiquidacion = {
  hoy: string;
  desde: string;
  hasta: string;
  /** true = pidieron más días de los permitidos y se acotó el período. */
  recortado: boolean;
  filas: FilaLiquidacion[];
  totales: {
    personas: number;
    bruto: number;
    descuento: number;
    neto: number;
    faltas: number;
    justificadosSinGoce: number;
    tardanzas: number;
    sinFormaDePago: number;
  };
  /** true = se cortó la lista de marcaciones: los números pueden estar incompletos. */
  incompleta: boolean;
};

export async function cargarLiquidacion(
  db: PrismaLocal,
  params: { desde?: string | null; hasta?: string | null }
): Promise<ReporteLiquidacion> {
  const hoy = claveDiaAsuncion(new Date());
  let desde = parsearFecha(params.desde ?? undefined, hoy);
  let hasta = parsearFecha(params.hasta ?? undefined, hoy);
  if (desde > hasta) [desde, hasta] = [hasta, desde];
  const recortado = diasEntre(desde, hasta, DIAS_MAXIMOS_LIQUIDACION + 1).length > DIAS_MAXIMOS_LIQUIDACION;
  if (recortado) desde = claveSumarDias(hasta, -(DIAS_MAXIMOS_LIQUIDACION - 1));

  const colaboradores = await db.colaborador.findMany({
    orderBy: [{ activo: "desc" }, { nombre: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      nombre: true,
      apellido: true,
      cargo: true,
      activo: true,
      diasTrabajo: true,
      tipoPago: true,
      montoPago: true,
      createdAt: true,
    },
  });

  const marcas = await db.marcacionAsistencia.findMany({
    where: { dia: { gte: desde, lte: hasta } },
    orderBy: { fecha: "asc" },
    take: MARCACIONES_MAXIMAS_LIQUIDACION,
    select: { colaboradorId: true, dia: true, tipo: true, tardanzaMin: true },
  });
  const incompleta = marcas.length >= MARCACIONES_MAXIMAS_LIQUIDACION;

  const registros = await db.ausenciaColaborador.findMany({
    where: { desde: { lte: hasta }, hasta: { gte: desde } },
    orderBy: [{ desde: "asc" }, { createdAt: "asc" }],
    select: { id: true, colaboradorId: true, desde: true, hasta: true, tipo: true, pagado: true, nota: true },
  });

  const diasDe = new Map<string, Set<string>>();
  const tardanzasDe = new Map<string, Map<string, number>>();
  for (const m of marcas) {
    const set = diasDe.get(m.colaboradorId);
    if (set) set.add(m.dia);
    else diasDe.set(m.colaboradorId, new Set([m.dia]));
    if (m.tipo === "entrada" && m.tardanzaMin !== null && m.tardanzaMin > 0) {
      const porDia = tardanzasDe.get(m.colaboradorId) ?? new Map<string, number>();
      // Si entró dos veces el mismo día (turno cortado) cuenta la tardanza más grande.
      porDia.set(m.dia, Math.max(porDia.get(m.dia) ?? 0, m.tardanzaMin));
      tardanzasDe.set(m.colaboradorId, porDia);
    }
  }
  const registrosDe = new Map<string, AusenciaRango[]>();
  for (const r of registros) {
    const lista = registrosDe.get(r.colaboradorId);
    if (lista) lista.push(r);
    else registrosDe.set(r.colaboradorId, [r]);
  }

  const filas: FilaLiquidacion[] = [];
  for (const c of colaboradores) {
    const marcados = diasDe.get(c.id) ?? new Set<string>();
    // Una persona dada de baja sin marcaciones en el período no aparece; con marcaciones, se la controla hasta la última.
    if (!c.activo && marcados.size === 0) continue;
    const ultimaMarca = [...marcados].sort().pop() ?? null;
    const diasTrabajo = normalizarDiasTrabajo(c.diasTrabajo);

    const dias = clasificarDias({
      desde,
      hasta,
      hoy,
      diasTrabajo,
      controlDesde: claveDiaAsuncion(c.createdAt),
      controlHasta: c.activo ? null : ultimaMarca,
      diasConMarcacion: marcados,
      ausencias: registrosDe.get(c.id) ?? [],
    });
    const resumen = resumirDias(dias);

    const forma = esFormaDePago(c.tipoPago) ? c.tipoPago : null;
    const monto = Math.max(0, Math.round(c.montoPago));
    const liquidacion = liquidar({ forma, monto, desde, hasta, resumen });
    const porDiaTarde = tardanzasDe.get(c.id) ?? new Map<string, number>();

    const detalle: DiaDetalleLiquidacion[] = [];
    for (const d of dias) {
      if (d.estado === "descanso" || d.estado === "sin_control" || d.estado === "futuro") continue;
      if (d.estado === "trabajo" || d.estado === "extra") {
        detalle.push({
          dia: d.dia,
          diaTexto: diaLargo(d.dia),
          estado: d.estado,
          etiqueta: d.estado === "extra" ? "Trabajó (era su día libre)" : "Trabajó",
          efecto: "paga",
          nota: null,
          tardanzaMin: porDiaTarde.get(d.dia) ?? null,
        });
      } else if (d.estado === "justificado" && d.ausencia) {
        detalle.push({
          dia: d.dia,
          diaTexto: diaLargo(d.dia),
          estado: "justificado",
          etiqueta: `${etiquetaDeAusencia(d.ausencia.tipo)} (${d.pagado ? "se paga" : "sin goce"})`,
          efecto: d.pagado ? "paga" : "descuenta",
          nota: d.ausencia.nota,
          tardanzaMin: null,
        });
      } else if (d.estado === "falta") {
        detalle.push({
          dia: d.dia,
          diaTexto: diaLargo(d.dia),
          estado: "falta",
          etiqueta: "Falta sin aviso",
          efecto: "descuenta",
          nota: null,
          tardanzaMin: null,
        });
      } else if (d.estado === "pendiente") {
        detalle.push({
          dia: d.dia,
          diaTexto: diaLargo(d.dia),
          estado: "pendiente",
          etiqueta: "Hoy, todavía no marcó",
          efecto: "neutro",
          nota: null,
          tardanzaMin: null,
        });
      }
    }

    filas.push({
      id: c.id,
      nombre: nombreDeColaborador(c),
      cargo: c.cargo,
      activo: c.activo,
      diasTrabajo,
      forma,
      monto,
      resumen,
      tardanzas: porDiaTarde.size,
      minutosTarde: [...porDiaTarde.values()].reduce((s, n) => s + n, 0),
      liquidacion,
      sinFormaDePago: !forma || monto <= 0,
      detalle,
    });
  }

  const totales = filas.reduce(
    (t, f) => {
      t.bruto += f.liquidacion.bruto;
      t.descuento += f.liquidacion.descuento;
      t.neto += f.liquidacion.neto;
      t.faltas += f.resumen.faltas;
      t.justificadosSinGoce += f.resumen.justificadosSinGoce;
      t.tardanzas += f.tardanzas;
      if (f.sinFormaDePago) t.sinFormaDePago += 1;
      return t;
    },
    { personas: filas.length, bruto: 0, descuento: 0, neto: 0, faltas: 0, justificadosSinGoce: 0, tardanzas: 0, sinFormaDePago: 0 }
  );

  return { hoy, desde, hasta, recortado, filas, totales, incompleta };
}

/**
 * El período que pidió la dirección (`fecha=hoy|mes|mesAnterior|rango` y, con rango, `desde` y `hasta`), en días ("YYYY-MM-DD").
 * Sin nada válido, este mes. La pantalla, el Excel y el PDF lo piden igual, así miran el mismo período.
 */
export function periodoDeLiquidacion(fecha?: string | null, desde?: string | null, hasta?: string | null) {
  const activa: FiltroFecha = (fecha as FiltroFecha | null | undefined) ?? "mes";
  const rango =
    calcularRangoFecha(activa, desde ?? undefined, hasta ?? undefined) ?? calcularRangoFecha("mes", undefined, undefined)!;
  return {
    activa,
    // El rango son instantes (el inicio del primer día y el inicio del siguiente al último): las marcaciones se cuentan por día.
    desde: claveDiaAsuncion(rango.gte),
    hasta: claveDiaAsuncion(new Date(rango.lt.getTime() - 1)),
  };
}
