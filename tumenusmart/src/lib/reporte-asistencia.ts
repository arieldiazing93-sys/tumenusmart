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
  /** Solo si se mira un día y todas las personas: quiénes (activos) no marcaron nada ese día. */
  sinMarcar: PersonaAsistencia[];
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
  tardanzaMin: number | null;
}): CeldaMarca {
  return {
    id: m.id,
    hora: horaAsuncion(m.fecha),
    fotoUrl: m.fotoUrl,
    verificada: m.verificada,
    tardanzaMin: m.tardanzaMin,
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

  const colaboradores: PersonaAsistencia[] = await db.colaborador.findMany({
    orderBy: [{ activo: "desc" }, { nombre: "asc" }, { createdAt: "asc" }],
    select: { id: true, nombre: true, apellido: true, cargo: true, fotoUrl: true, activo: true },
  });

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
  const sinMarcar = unSoloDia && !q ? colaboradores.filter((c) => c.activo && !conMarcas.has(c.id)) : [];

  const resumenPorPersona: ResumenPersona[] = [];
  for (const [id, r] of acumulados) {
    const persona = personaDe.get(id);
    if (!persona) continue;
    resumenPorPersona.push({
      persona,
      dias: r.dias.size,
      minutos: r.minutos,
      tardanzas: r.tardanzas,
      pendientes: r.pendientes,
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
    sinMarcar,
    hayMas,
  };
}
