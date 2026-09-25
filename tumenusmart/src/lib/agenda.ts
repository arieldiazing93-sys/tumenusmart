/**
 * La Agenda de la Reserva de turnos: vistas, estados, fechas y cómo se acomodan
 * los turnos en el calendario.
 *
 * Todo puro (sin Prisma) para poder usarlo tanto desde las pantallas del
 * servidor como desde la barra del navegador. Las fechas de la grilla son
 * claves "YYYY-MM-DD" en hora de Asunción; los turnos se guardan como instantes
 * reales y se pasan a hora local recién acá (`partesLocales`).
 */

import { claveSumarDias, construirGrillaMes, diasDeLaSemana, NOMBRES_MES } from "./calendario";
import { textoLocalDesdeInstante } from "./timezone";

// ---------------------------------------------------------------------------
//  Vistas
// ---------------------------------------------------------------------------

export type VistaAgenda = "dia" | "semana" | "mes";

export const VISTAS_AGENDA: { valor: VistaAgenda; etiqueta: string }[] = [
  { valor: "dia", etiqueta: "Día" },
  { valor: "semana", etiqueta: "Semana" },
  { valor: "mes", etiqueta: "Mes" },
];

export function parsearVista(valor: string | undefined): VistaAgenda | null {
  return valor === "dia" || valor === "semana" || valor === "mes" ? valor : null;
}

// ---------------------------------------------------------------------------
//  Estados de un turno
// ---------------------------------------------------------------------------

export type EstadoCita = "pendiente" | "proxima" | "finalizada" | "cancelada" | "no_asistio";

/**
 * Los estados y cómo se ven. Cada uno tiene su propio color con significado: ámbar
 * lo que falta confirmar, azul lo que viene, verde lo que ya se cobró, rojo lo que
 * se cayó, gris lo que no vino. Es el mismo color en el calendario, en las cifras de
 * arriba y en la cabecera del detalle de la cita, para entenderlo de un vistazo.
 *
 * Las clases van completas (nunca armadas con pedazos) porque Tailwind solo genera
 * las que ve escritas.
 */
export const ESTADOS_CITA: {
  valor: EstadoCita;
  etiqueta: string;
  /** El bloque del turno en el calendario: degradado suave, texto y una franja de color a la izquierda. */
  bloque: string;
  /** El puntito de color (mes, filtro). */
  punto: string;
  /** El círculo con el ícono del estado (esquina del turno y cabecera del detalle). */
  insignia: string;
  /** La cabecera del detalle: degradado (con el color del texto que se lee bien encima). */
  cabecera: string;
  /** La pastilla de arriba del calendario y del selector de estado del detalle. */
  pastilla: string;
  /** La misma pastilla cuando está elegida: llena del color fuerte. */
  elegida: string;
  /** El numerito de esa pastilla. */
  cantidad: string;
}[] = [
  {
    valor: "pendiente",
    etiqueta: "Pendiente",
    bloque: "border-amber-300 border-l-amber-500 bg-gradient-to-br from-amber-200/80 to-amber-50 text-amber-950",
    punto: "bg-amber-500",
    insignia: "bg-amber-500 text-amber-950",
    cabecera: "from-amber-400 via-amber-500 to-orange-500 text-amber-950",
    pastilla: "border-amber-300 bg-amber-50 text-amber-900 hover:border-amber-400 hover:bg-amber-100",
    elegida: "border-amber-500 bg-amber-500 text-amber-950 shadow-md shadow-amber-500/30",
    cantidad: "bg-amber-200 text-amber-900",
  },
  {
    valor: "proxima",
    etiqueta: "Próxima",
    bloque: "border-sky-300 border-l-blue-500 bg-gradient-to-br from-sky-200/80 to-sky-50 text-blue-950",
    punto: "bg-blue-500",
    insignia: "bg-blue-500 text-white",
    cabecera: "from-blue-600 via-blue-600 to-indigo-600 text-white",
    pastilla: "border-sky-300 bg-sky-50 text-blue-900 hover:border-sky-400 hover:bg-sky-100",
    elegida: "border-blue-600 bg-blue-600 text-white shadow-md shadow-blue-600/30",
    cantidad: "bg-sky-200 text-blue-900",
  },
  {
    valor: "finalizada",
    etiqueta: "Finalizada",
    bloque: "border-emerald-300 border-l-emerald-600 bg-gradient-to-br from-emerald-200/80 to-emerald-50 text-emerald-950",
    punto: "bg-emerald-500",
    insignia: "bg-emerald-600 text-white",
    cabecera: "from-emerald-600 via-emerald-700 to-teal-700 text-white",
    pastilla: "border-emerald-300 bg-emerald-50 text-emerald-900 hover:border-emerald-400 hover:bg-emerald-100",
    elegida: "border-emerald-600 bg-emerald-600 text-white shadow-md shadow-emerald-600/30",
    cantidad: "bg-emerald-200 text-emerald-900",
  },
  {
    valor: "cancelada",
    etiqueta: "Cancelada",
    bloque: "border-rose-300 border-l-red-500 bg-gradient-to-br from-rose-100 to-rose-50 text-red-900 line-through opacity-70",
    punto: "bg-red-500",
    insignia: "bg-red-500 text-white",
    cabecera: "from-rose-600 via-red-600 to-red-700 text-white",
    pastilla: "border-rose-300 bg-rose-50 text-red-900 hover:border-rose-400 hover:bg-rose-100",
    elegida: "border-red-600 bg-red-600 text-white shadow-md shadow-red-600/30",
    cantidad: "bg-rose-200 text-red-900",
  },
  {
    valor: "no_asistio",
    etiqueta: "No asistió",
    bloque: "border-slate-300 border-l-slate-500 bg-gradient-to-br from-slate-200 to-slate-50 text-slate-700",
    punto: "bg-slate-400",
    insignia: "bg-slate-500 text-white",
    cabecera: "from-slate-600 via-slate-700 to-slate-800 text-white",
    pastilla: "border-slate-300 bg-slate-50 text-slate-700 hover:border-slate-400 hover:bg-slate-100",
    elegida: "border-slate-600 bg-slate-600 text-white shadow-md shadow-slate-600/30",
    cantidad: "bg-slate-200 text-slate-700",
  },
];

/** La cabecera del detalle cuando la cita todavía no existe (se está anotando una nueva). */
export const CABECERA_CITA_NUEVA = "from-violet-600 via-purple-600 to-fuchsia-600 text-white";

/**
 * Los tres momentos del día, con su color: la mañana amarilla, la tarde naranja, la
 * noche índigo. Pintan el fondo del calendario (mismos cortes que las horas de la
 * página de reservas: hasta las 12, hasta las 18 y el resto) para ubicarse por color.
 */
export const MOMENTOS_DEL_DIA: {
  desde: number;
  hasta: number;
  /** El tinte de fondo en la grilla. */
  fondo: string;
  /** La barrita al costado de las horas. */
  barra: string;
}[] = [
  { desde: 0, hasta: 12 * 60, fondo: "bg-amber-100/45", barra: "bg-amber-300" },
  { desde: 12 * 60, hasta: 18 * 60, fondo: "bg-orange-100/45", barra: "bg-orange-300" },
  { desde: 18 * 60, hasta: 24 * 60, fondo: "bg-indigo-100/50", barra: "bg-indigo-300" },
];

export function esEstadoCita(valor: string): valor is EstadoCita {
  return ESTADOS_CITA.some((e) => e.valor === valor);
}

/** Un estado guardado que no se conoce (un valor viejo, un typo) cae en "pendiente". */
export function estadoDeCita(valor: string): (typeof ESTADOS_CITA)[number] {
  return ESTADOS_CITA.find((e) => e.valor === valor) ?? ESTADOS_CITA[0];
}

/** Los estados que la URL pidió ocultar (`ocultar=cancelada,no_asistio`), sin repetidos ni inventados. */
export function parsearOcultar(valor: string | undefined): EstadoCita[] {
  if (!valor) return [];
  const vistos = new Set<EstadoCita>();
  for (const parte of valor.split(",")) {
    const estado = parte.trim();
    if (esEstadoCita(estado)) vistos.add(estado);
  }
  return ESTADOS_CITA.map((e) => e.valor).filter((v) => vistos.has(v));
}

// ---------------------------------------------------------------------------
//  Personal: el avatar con iniciales
// ---------------------------------------------------------------------------

/** Colores del avatar, en rotación por orden del personal: solo decoran, no significan nada. */
export const AVATARES = [
  "bg-brand-light text-brand-texto",
  "bg-azul-luz text-azul-oscuro",
  "bg-exito-luz text-exito",
  "bg-violeta-luz text-violeta-oscuro",
];

/** "Sr. Juan Britez" → "SB": la inicial de la primera y de la última palabra. */
export function iniciales(nombre: string): string {
  const palabras = nombre.trim().split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return "?";
  const primera = palabras[0][0];
  const ultima = palabras.length > 1 ? palabras[palabras.length - 1][0] : (palabras[0][1] ?? "");
  return `${primera}${ultima}`.toUpperCase();
}

// ---------------------------------------------------------------------------
//  Lo que dice la URL
// ---------------------------------------------------------------------------

export type ParametrosAgenda = {
  vista: VistaAgenda;
  /** Un día cualquiera de lo que se está viendo ("YYYY-MM-DD"). */
  fecha: string;
  /** Id del miembro del personal, o null para ver a todos. */
  personal: string | null;
  ocultar: EstadoCita[];
};

/** La dirección de la agenda con estos parámetros, cambiando solo lo que se pida. */
export function urlAgenda(base: ParametrosAgenda, cambios: Partial<ParametrosAgenda> = {}): string {
  const p = { ...base, ...cambios };
  const consulta = new URLSearchParams();
  consulta.set("vista", p.vista);
  consulta.set("fecha", p.fecha);
  if (p.personal) consulta.set("personal", p.personal);
  if (p.ocultar.length > 0) consulta.set("ocultar", p.ocultar.join(","));
  return `/admin/agenda?${consulta.toString()}`;
}

/** La dirección de la agenda con el detalle de esa cita abierto en el panel de la derecha. */
export function urlCita(base: ParametrosAgenda, citaId: string): string {
  return `${urlAgenda(base)}&cita=${encodeURIComponent(citaId)}`;
}

/** La fecha de la URL si es un día real ("2026-02-30" no lo es); si no, `hoy`. */
export function parsearFecha(valor: string | undefined, hoy: string): string {
  if (!valor || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return hoy;
  return claveSumarDias(valor, 0) === valor ? valor : hoy;
}

// ---------------------------------------------------------------------------
//  Fechas de la grilla
// ---------------------------------------------------------------------------

const DIAS_CORTOS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const DIAS_LARGOS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function partesDeClave(clave: string): { anio: number; mes: number; dia: number; diaSemana: number } {
  const [anio, mes, dia] = clave.split("-").map(Number);
  return { anio, mes: mes - 1, dia, diaSemana: new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay() };
}

/** "lun", "mar"… de un día. */
export function diaCorto(clave: string): string {
  return DIAS_CORTOS[partesDeClave(clave).diaSemana];
}

/** "Jueves 24 sep" de un día. */
export function diaLargo(clave: string): string {
  const { dia, mes, diaSemana } = partesDeClave(clave);
  const texto = `${DIAS_LARGOS[diaSemana]} ${dia} ${MESES_CORTOS[mes]}`;
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** Número del día del mes: "2026-09-24" → 24. */
export function numeroDeDia(clave: string): number {
  return partesDeClave(clave).dia;
}

/** Día de la semana de una fecha: 0 = domingo … 6 = sábado. */
export function diaDeLaSemana(clave: string): number {
  return partesDeClave(clave).diaSemana;
}

export function esFinDeSemana(clave: string): boolean {
  const { diaSemana } = partesDeClave(clave);
  return diaSemana === 0 || diaSemana === 6;
}

/** Los días que abarca la vista, de primero a último ("YYYY-MM-DD"). */
export function diasDeVista(vista: VistaAgenda, clave: string): string[] {
  if (vista === "dia") return [clave];
  if (vista === "semana") return diasDeLaSemana(clave);
  const { anio, mes } = partesDeClave(clave);
  return construirGrillaMes(anio, mes).map((c) => c.fecha);
}

/** El día al que llevan las flechas: uno, siete días, o un mes hacia adelante o atrás. */
export function fechaVecina(vista: VistaAgenda, clave: string, paso: -1 | 1): string {
  if (vista === "dia") return claveSumarDias(clave, paso);
  if (vista === "semana") return claveSumarDias(clave, paso * 7);
  const { anio, mes } = partesDeClave(clave);
  return new Date(Date.UTC(anio, mes + paso, 1)).toISOString().slice(0, 10);
}

/** El título de arriba del calendario: "Jueves 24 sep", "21 sep – 27 sep", "Septiembre 2026". */
export function tituloAgenda(vista: VistaAgenda, clave: string): string {
  if (vista === "dia") return diaLargo(clave);
  if (vista === "mes") {
    const { anio, mes } = partesDeClave(clave);
    return `${NOMBRES_MES[mes]} ${anio}`;
  }
  const dias = diasDeLaSemana(clave);
  const a = partesDeClave(dias[0]);
  const b = partesDeClave(dias[6]);
  const desde = `${a.dia} ${MESES_CORTOS[a.mes]}${a.anio !== b.anio ? ` ${a.anio}` : ""}`;
  return `${desde} – ${b.dia} ${MESES_CORTOS[b.mes]}${a.anio !== b.anio ? ` ${b.anio}` : ""}`;
}

// ---------------------------------------------------------------------------
//  Turnos en la grilla
// ---------------------------------------------------------------------------

/** Un turno como lo necesita el calendario (ya sin Prisma). */
export type CitaAgenda = {
  id: string;
  personalId: string;
  personalNombre: string;
  clienteNombre: string;
  inicio: Date;
  fin: Date;
  estado: string;
  precio: number | null;
  /** Los servicios en una línea ("Corte Moderno + Barba"), si el turno los tiene. */
  serviciosTexto: string | null;
  /** true si ya se cobró en la caja (se marca con una tilde en el calendario). */
  cobrada: boolean;
  /** El color de cada servicio del turno ("#RRGGBB"), tal como se eligió en Servicios. */
  colores: string[];
};

/** El día ("YYYY-MM-DD") y los minutos desde la medianoche de un instante, en hora de Asunción. */
export function partesLocales(instante: Date): { dia: string; minutos: number } {
  const texto = textoLocalDesdeInstante(instante); // "YYYY-MM-DDTHH:MM"
  return { dia: texto.slice(0, 10), minutos: Number(texto.slice(11, 13)) * 60 + Number(texto.slice(14, 16)) };
}

/** 545 → "09:05". */
export function horaDeMinutos(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Las horas que se muestran por defecto; se amplían si algún turno cae afuera. */
const MINUTOS_INICIO_POR_DEFECTO = 8 * 60;
const MINUTOS_FIN_POR_DEFECTO = 21 * 60;

/**
 * Desde qué hora y hasta cuál se dibuja la grilla, en minutos y en horas
 * enteras. Parte del horario de trabajo (`base`) si hay uno configurado, o de un
 * tramo por defecto, y se amplía si algún turno cae afuera.
 */
export function rangoDeHoras(
  citas: { desde: number; hasta: number }[],
  base: { inicio: number; fin: number } | null = null
): { inicio: number; fin: number } {
  let inicio = base?.inicio ?? MINUTOS_INICIO_POR_DEFECTO;
  let fin = base?.fin ?? MINUTOS_FIN_POR_DEFECTO;
  for (const c of citas) {
    inicio = Math.min(inicio, Math.floor(c.desde / 60) * 60);
    fin = Math.max(fin, Math.ceil(c.hasta / 60) * 60);
  }
  return { inicio: Math.max(0, inicio), fin: Math.min(24 * 60, fin) };
}

/**
 * Reparte en carriles los turnos que se pisan, para que se vean lado a lado en
 * vez de uno encima del otro. Cada grupo de turnos que se tocan se reparte por
 * separado: un turno solo ocupa todo el ancho aunque a otra hora haya tres
 * juntos.
 */
export function repartirCarriles<T extends { desde: number; hasta: number }>(
  turnos: T[]
): (T & { carril: number; carriles: number })[] {
  const orden = [...turnos].sort((a, b) => a.desde - b.desde || a.hasta - b.hasta);
  const salida: (T & { carril: number; carriles: number })[] = [];

  let grupo: { turno: T; carril: number }[] = [];
  let finPorCarril: number[] = [];
  let finDelGrupo = -1;

  const cerrarGrupo = () => {
    const carriles = finPorCarril.length;
    for (const g of grupo) salida.push({ ...g.turno, carril: g.carril, carriles });
    grupo = [];
    finPorCarril = [];
    finDelGrupo = -1;
  };

  for (const turno of orden) {
    if (grupo.length > 0 && turno.desde >= finDelGrupo) cerrarGrupo();
    let carril = finPorCarril.findIndex((fin) => fin <= turno.desde);
    if (carril === -1) {
      carril = finPorCarril.length;
      finPorCarril.push(turno.hasta);
    } else {
      finPorCarril[carril] = turno.hasta;
    }
    grupo.push({ turno, carril });
    finDelGrupo = Math.max(finDelGrupo, turno.hasta);
  }
  cerrarGrupo();
  return salida;
}
