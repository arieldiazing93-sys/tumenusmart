/**
 * El reporte de asistencia (Marcaciones), armado en UN solo lugar: la pantalla, el Excel y el PDF lo piden acá, así los
 * tres muestran exactamente los mismos números (mismo criterio que src/lib/reporte-personal.ts).
 *
 * Recibe el cliente ya filtrado por local (`prismaDelLocal`): nunca ve datos de otro negocio.
 */

import { diaLargo, parsearFecha } from "./agenda";
import {
  armarTurnos,
  nombreDeColaborador,
  formatearDuracion,
  type CeldaMarca,
  type FilaAsistencia,
  type TipoMarcacion,
} from "./asistencia";
import {
  clasificarDias,
  etiquetaDeAusencia,
  normalizarDiasTrabajo,
  type AusenciaRango,
  type DiaClasificado,
} from "./ausencias";
import { claveSumarDias } from "./calendario";
import type { PrismaLocal } from "./prisma-local";
import { claveDiaAsuncion, horaAsuncion } from "./timezone";

/** Cuántos días como máximo se miran de una vez (el reporte arma todo en memoria). */
export const DIAS_MAXIMOS_REPORTE = 62;
/** Tope de marcaciones que se traen para la pantalla y el PDF: con 25 personas y 4 marcas por día, 62 días son ~6.200. */
export const MARCACIONES_MAXIMAS_PANTALLA = 7000;
/** Tope para el Excel, que es para procesar los datos: alcanza para ~75 personas durante 62 días. */
export const MARCACIONES_MAXIMAS_EXCEL = 30000;

export type PersonaAsistencia = {
  id: string;
  nombre: string;
  apellido: string | null;
  cargo: string | null;
  fotoUrl: string | null;
  activo: boolean;
};

export type ResumenPersona = {
  persona: PersonaAsistencia;
  /** En cuántos días distintos marcó. */
  dias: number;
  minutos: number;
  tardanzas: number;
  /** Turnos con algo para revisar (sin salida, sin vuelta, sin cara). */
  pendientes: number;
  /** Días que tenía que ir y no vino ni avisó. */
  faltas: number;
  /** Días que no vino pero tienen su motivo anotado (reposo, aviso, vacaciones, feriado...). */
  justificados: number;
};

/**
 * Un día (o varios seguidos) en que alguien tenía que ir y no marcó, con lo que se sabe de por qué:
 *  - `falta`: no marcó ni se anotó nada (se puede justificar).
 *  - `justificado`: no marcó pero se anotó el motivo (un reposo de varios días es UNA fila).
 *  - `pendiente`: es hoy y todavía no marcó.
 */
export type FilaAusenciaReporte = {
  clave: string;
  /** El primer día de la fila ("YYYY-MM-DD") y el último (el mismo si es uno solo). */
  dia: string;
  hasta: string;
  /** Cuántos días de trabajo cubre dentro del período mirado. */
  dias: number;
  diaTexto: string;
  colaboradorId: string;
  nombre: string;
  cargo: string | null;
  estado: "falta" | "justificado" | "pendiente";
  /** El registro anotado (null en una falta sin anotar o en uno pendiente). */
  ausenciaId: string | null;
  tipo: string | null;
  /** Lo que se lee en pantalla: "Falta sin aviso", "Reposo médico", "Todavía no marcó". */
  etiqueta: string;
  pagado: boolean;
  nota: string | null;
  /** El rango completo del registro (puede ser más largo que lo que se está mirando). */
  ausenciaDesde: string | null;
  ausenciaHasta: string | null;
};

export type ReporteAsistencia = {
  hoy: string;
  desde: string;
  hasta: string;
  /** true = pidieron más días de los permitidos y se acotó el período. */
  recortado: boolean;
  unSoloDia: boolean;
  /** Todas las personas del local (para sugerirlas en el buscador). */
  colaboradores: PersonaAsistencia[];
  /** Lo que se buscó, tal como lo escribió ("" = todas las personas). */
  buscar: string;
  /** Cuántas personas coinciden con la búsqueda (con búsqueda vacía, todas). */
  coincidencias: number;
  /** La persona, si la búsqueda coincide con una sola; si no, null (todas, o varias). */
  personaElegida: PersonaAsistencia | null;
  /** Un turno por fila: lo más reciente primero; el mismo día, por nombre y por hora de entrada. */
  filas: FilaAsistencia[];
  resumenPorPersona: ResumenPersona[];
  personasQueMarcaron: number;
  minutosTotales: number;
  tardanzas: number;
  paraRevisar: number;
  /** Los días que alguien tenía que ir y no marcó (faltas, justificados y, hoy, los que todavía no marcaron): lo más reciente primero. */
  ausencias: FilaAusenciaReporte[];
  /** Cuántos días de falta sin aviso hay en el período (sumados todos). */
  faltas: number;
  /** Cuántos días no vino con el motivo anotado. */
  justificados: number;
  /** true = hay tantas marcaciones que se cortó la lista: no se puede asegurar quién faltó, así que las faltas no se calculan. */
  faltasNoCalculadas: boolean;
  /** true = se llegó al tope de marcaciones y puede faltar alguna. */
  hayMas: boolean;
};

/** Sin tildes ni mayúsculas, para que "perez" encuentre a "Pérez". */
function sinTildes(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function diasEntre(desde: string, hasta: string): number {
  const [y1, m1, d1] = desde.split("-").map(Number);
  const [y2, m2, d2] = hasta.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

function celdaDe(m: {
  id: string;
  fecha: Date;
  fotoUrl: string | null;
  verificada: boolean;
  distanciaRostro: number | null;
  tardanzaMin: number | null;
  metodo: string;
}): CeldaMarca {
  return {
    id: m.id,
    hora: horaAsuncion(m.fecha),
    fotoUrl: m.fotoUrl,
    verificada: m.verificada,
    distanciaRostro: m.distanciaRostro,
    tardanzaMin: m.tardanzaMin,
    metodo: m.metodo,
  };
}

export async function cargarReporteAsistencia(
  db: PrismaLocal,
  params: { desde?: string | null; hasta?: string | null; buscar?: string | null },
  limiteMarcaciones: number
): Promise<ReporteAsistencia> {
  const hoy = claveDiaAsuncion(new Date());
  let desde = parsearFecha(params.desde ?? undefined, hoy);
  let hasta = parsearFecha(params.hasta ?? undefined, hoy);
  if (desde > hasta) [desde, hasta] = [hasta, desde];
  const recortado = diasEntre(desde, hasta) + 1 > DIAS_MAXIMOS_REPORTE;
  if (recortado) desde = claveSumarDias(hasta, -(DIAS_MAXIMOS_REPORTE - 1));

  const filasColaborador = await db.colaborador.findMany({
    orderBy: [{ activo: "desc" }, { nombre: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      nombre: true,
      apellido: true,
      cargo: true,
      fotoUrl: true,
      activo: true,
      diasTrabajo: true,
      createdAt: true,
    },
  });
  const colaboradores: PersonaAsistencia[] = filasColaborador.map(
    ({ id, nombre, apellido, cargo, fotoUrl, activo }) => ({ id, nombre, apellido, cargo, fotoUrl, activo })
  );
  // Lo que hace falta para saber qué días tenía que ir cada una y desde cuándo se la controla (el día en que se la dio de alta).
  const controlDe = new Map(
    filasColaborador.map((c) => [
      c.id,
      { diasTrabajo: normalizarDiasTrabajo(c.diasTrabajo), controlDesde: claveDiaAsuncion(c.createdAt) },
    ])
  );

  // El buscador: por nombre, apellido o cargo, sin importar tildes ni mayúsculas. Si coincide con una sola persona,
  // el reporte es de esa persona; si coincide con varias, de todas ellas; si con ninguna, no hay nada que mostrar.
  const buscar = (params.buscar ?? "").trim().slice(0, 60);
  const q = sinTildes(buscar);
  const coinciden = q
    ? colaboradores.filter((c) => sinTildes(`${nombreDeColaborador(c)} ${c.cargo ?? ""}`).includes(q))
    : colaboradores;
  const personaElegida = q && coinciden.length === 1 ? coinciden[0] : null;

  const marcas = await db.marcacionAsistencia.findMany({
    where: { dia: { gte: desde, lte: hasta }, ...(q ? { colaboradorId: { in: coinciden.map((c) => c.id) } } : {}) },
    orderBy: { fecha: "asc" },
    take: limiteMarcaciones,
    select: {
      id: true,
      colaboradorId: true,
      tipo: true,
      dia: true,
      fecha: true,
      fotoUrl: true,
      verificada: true,
      distanciaRostro: true,
      metodo: true,
      tardanzaMin: true,
    },
  });
  const hayMas = marcas.length >= limiteMarcaciones;

  // Las marcaciones de cada persona en cada día, para armar sus turnos.
  const porPersonaYDia = new Map<string, typeof marcas>();
  for (const m of marcas) {
    const clave = `${m.colaboradorId}|${m.dia}`;
    const lista = porPersonaYDia.get(clave);
    if (lista) lista.push(m);
    else porPersonaYDia.set(clave, [m]);
  }

  const personaDe = new Map(colaboradores.map((c) => [c.id, c]));
  const filas: FilaAsistencia[] = [];
  const acumulados = new Map<string, { dias: Set<string>; minutos: number; tardanzas: number; pendientes: number }>();
  let minutosTotales = 0;

  for (const [clave, lista] of porPersonaYDia) {
    const [colaboradorId, dia] = clave.split("|");
    const persona = personaDe.get(colaboradorId);
    if (!persona) continue;
    const turnos = armarTurnos(lista, dia, hoy);

    const acumulado = acumulados.get(colaboradorId) ?? {
      dias: new Set<string>(),
      minutos: 0,
      tardanzas: 0,
      pendientes: 0,
    };
    acumulado.dias.add(dia);

    turnos.forEach((t, n) => {
      const celdas: Record<TipoMarcacion, CeldaMarca | null> = {
        entrada: t.entrada ? celdaDe(t.entrada) : null,
        salida_almuerzo: t.salidaAlmuerzo ? celdaDe(t.salidaAlmuerzo) : null,
        vuelta_almuerzo: t.vueltaAlmuerzo ? celdaDe(t.vueltaAlmuerzo) : null,
        salida: t.salida ? celdaDe(t.salida) : null,
      };
      filas.push({
        clave: `${clave}|${n}`,
        dia,
        diaTexto: diaLargo(dia),
        colaboradorId,
        nombre: nombreDeColaborador(persona),
        cargo: persona.cargo,
        fotoAlta: persona.fotoUrl,
        celdas,
        trabajado: formatearDuracion(t.minutosTrabajados),
        almuerzo: formatearDuracion(t.minutosAlmuerzo),
        minutosTrabajados: t.minutosTrabajados,
        minutosAlmuerzo: t.minutosAlmuerzo,
        tardanzaMin: t.tardanzaMin,
        estado: t.estado,
        avisos: [...t.avisos],
      });
      if (t.minutosTrabajados !== null) {
        acumulado.minutos += t.minutosTrabajados;
        minutosTotales += t.minutosTrabajados;
      }
      if (t.tardanzaMin !== null && t.tardanzaMin > 0) acumulado.tardanzas += 1;
      if (t.avisos.some((a) => !a.startsWith("Llegó"))) acumulado.pendientes += 1;
    });
    acumulados.set(colaboradorId, acumulado);
  }

  filas.sort((a, b) => {
    if (a.dia !== b.dia) return a.dia < b.dia ? 1 : -1;
    if (a.nombre !== b.nombre) return a.nombre.localeCompare(b.nombre, "es");
    return (a.celdas.entrada?.hora ?? "").localeCompare(b.celdas.entrada?.hora ?? "");
  });

  const tardanzas = filas.filter((f) => f.tardanzaMin !== null && f.tardanzaMin > 0).length;
  const paraRevisar = filas.filter((f) => f.avisos.some((a) => !a.startsWith("Llegó"))).length;

  const unSoloDia = desde === hasta;
  const conMarcas = new Set(filas.map((f) => f.colaboradorId));

  // ---------- los días que tenía que ir y no marcó ----------
  const registros = await db.ausenciaColaborador.findMany({
    where: {
      desde: { lte: hasta },
      hasta: { gte: desde },
      ...(q ? { colaboradorId: { in: coinciden.map((c) => c.id) } } : {}),
    },
    orderBy: [{ desde: "asc" }, { createdAt: "asc" }],
    select: { id: true, colaboradorId: true, desde: true, hasta: true, tipo: true, pagado: true, nota: true },
  });
  const registrosDe = new Map<string, AusenciaRango[]>();
  for (const r of registros) {
    const lista = registrosDe.get(r.colaboradorId);
    if (lista) lista.push(r);
    else registrosDe.set(r.colaboradorId, [r]);
  }
  const diasConMarca = new Map<string, Set<string>>();
  for (const m of marcas) {
    const set = diasConMarca.get(m.colaboradorId);
    if (set) set.add(m.dia);
    else diasConMarca.set(m.colaboradorId, new Set([m.dia]));
  }

  const ausencias: FilaAusenciaReporte[] = [];
  const faltasDe = new Map<string, { faltas: number; justificados: number }>();
  // Con la lista de marcaciones cortada no se puede asegurar quién faltó: solo se muestran los motivos que ya estaban anotados.
  const faltasNoCalculadas = hayMas;

  for (const persona of coinciden) {
    const control = controlDe.get(persona.id);
    if (!control) continue;
    const marcadosEstaPersona = diasConMarca.get(persona.id) ?? new Set<string>();
    // Una persona dada de baja se controla hasta su última marcación del período (lo que viene después no es falta).
    const ultimaMarca = [...marcadosEstaPersona].sort().pop() ?? null;
    const dias: DiaClasificado[] = clasificarDias({
      desde,
      hasta,
      hoy,
      diasTrabajo: control.diasTrabajo,
      controlDesde: control.controlDesde,
      controlHasta: persona.activo ? null : (ultimaMarca ?? "0000-00-00"),
      diasConMarcacion: marcadosEstaPersona,
      ausencias: registrosDe.get(persona.id) ?? [],
    });

    const cuenta = { faltas: 0, justificados: 0 };
    // Un reposo de varios días es UNA fila: se junta por registro.
    const porRegistro = new Map<string, { primero: string; ultimo: string; dias: number; registro: AusenciaRango }>();

    for (const d of dias) {
      if (d.estado === "justificado" && d.ausencia) {
        cuenta.justificados += 1;
        const previo = porRegistro.get(d.ausencia.id);
        if (previo) {
          previo.ultimo = d.dia;
          previo.dias += 1;
        } else {
          porRegistro.set(d.ausencia.id, { primero: d.dia, ultimo: d.dia, dias: 1, registro: d.ausencia });
        }
      } else if (d.estado === "falta" && !faltasNoCalculadas) {
        cuenta.faltas += 1;
        ausencias.push({
          clave: `${persona.id}|${d.dia}|falta`,
          dia: d.dia,
          hasta: d.dia,
          dias: 1,
          diaTexto: diaLargo(d.dia),
          colaboradorId: persona.id,
          nombre: nombreDeColaborador(persona),
          cargo: persona.cargo,
          estado: "falta",
          ausenciaId: null,
          tipo: null,
          etiqueta: "Falta sin aviso",
          pagado: false,
          nota: null,
          ausenciaDesde: null,
          ausenciaHasta: null,
        });
      } else if (d.estado === "pendiente" && !faltasNoCalculadas) {
        ausencias.push({
          clave: `${persona.id}|${d.dia}|pendiente`,
          dia: d.dia,
          hasta: d.dia,
          dias: 1,
          diaTexto: diaLargo(d.dia),
          colaboradorId: persona.id,
          nombre: nombreDeColaborador(persona),
          cargo: persona.cargo,
          estado: "pendiente",
          ausenciaId: null,
          tipo: null,
          etiqueta: "Todavía no marcó",
          pagado: false,
          nota: null,
          ausenciaDesde: null,
          ausenciaHasta: null,
        });
      }
    }

    for (const g of porRegistro.values()) {
      ausencias.push({
        clave: `${persona.id}|${g.registro.id}`,
        dia: g.primero,
        hasta: g.ultimo,
        dias: g.dias,
        diaTexto: g.primero === g.ultimo ? diaLargo(g.primero) : `${diaLargo(g.primero)} – ${diaLargo(g.ultimo)}`,
        colaboradorId: persona.id,
        nombre: nombreDeColaborador(persona),
        cargo: persona.cargo,
        estado: "justificado",
        ausenciaId: g.registro.id,
        tipo: g.registro.tipo,
        etiqueta: etiquetaDeAusencia(g.registro.tipo),
        pagado: g.registro.pagado,
        nota: g.registro.nota,
        ausenciaDesde: g.registro.desde,
        ausenciaHasta: g.registro.hasta,
      });
    }
    if (cuenta.faltas > 0 || cuenta.justificados > 0) faltasDe.set(persona.id, cuenta);
  }
  ausencias.sort((a, b) => {
    if (a.dia !== b.dia) return a.dia < b.dia ? 1 : -1;
    return a.nombre.localeCompare(b.nombre, "es");
  });
  const faltas = [...faltasDe.values()].reduce((s, c) => s + c.faltas, 0);
  const justificados = [...faltasDe.values()].reduce((s, c) => s + c.justificados, 0);

  // El resumen por persona: las que marcaron y también las que solo tienen faltas o días justificados.
  const resumenPorPersona: ResumenPersona[] = [];
  const ids = new Set<string>([...acumulados.keys(), ...faltasDe.keys()]);
  for (const id of ids) {
    const persona = personaDe.get(id);
    if (!persona) continue;
    const r = acumulados.get(id);
    const c = faltasDe.get(id);
    resumenPorPersona.push({
      persona,
      dias: r ? r.dias.size : 0,
      minutos: r ? r.minutos : 0,
      tardanzas: r ? r.tardanzas : 0,
      pendientes: r ? r.pendientes : 0,
      faltas: c ? c.faltas : 0,
      justificados: c ? c.justificados : 0,
    });
  }
  resumenPorPersona.sort((a, b) =>
    nombreDeColaborador(a.persona).localeCompare(nombreDeColaborador(b.persona), "es")
  );

  return {
    hoy,
    desde,
    hasta,
    recortado,
    unSoloDia,
    colaboradores,
    buscar,
    coincidencias: coinciden.length,
    personaElegida,
    filas,
    resumenPorPersona,
    personasQueMarcaron: conMarcas.size,
    minutosTotales,
    tardanzas,
    paraRevisar,
    ausencias,
    faltas,
    justificados,
    faltasNoCalculadas,
    hayMas,
  };
}
