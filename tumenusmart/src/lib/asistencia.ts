/**
 * Registro de asistencia — las reglas, sin base de datos ni pantalla (se pueden probar solas).
 *
 * Una persona marca cuatro cosas en el día: ENTRADA, SALIDA A ALMORZAR, VUELTA DEL ALMUERZO y
 * SALIDA. Lo que puede marcar en cada momento sale de lo último que marcó (no se puede marcar
 * dos veces la entrada ni salir sin haber entrado), y el almuerzo es opcional: quien no sale a
 * almorzar marca entrada y salida nomás.
 */

import { GESTOS } from "./vision-facial";

export type TipoMarcacion = "entrada" | "salida_almuerzo" | "vuelta_almuerzo" | "salida";

export const TIPOS_MARCACION: TipoMarcacion[] = ["entrada", "salida_almuerzo", "vuelta_almuerzo", "salida"];

/** Cómo se llama cada marcación en pantalla. */
export const ETIQUETA_TIPO: Record<TipoMarcacion, string> = {
  entrada: "Entrada",
  salida_almuerzo: "Salida a almorzar",
  vuelta_almuerzo: "Vuelta del almuerzo",
  salida: "Salida",
};

/** Versión corta, para los títulos de las columnas del reporte. */
export const ETIQUETA_TIPO_CORTA: Record<TipoMarcacion, string> = {
  entrada: "Entrada",
  salida_almuerzo: "Sale a almorzar",
  vuelta_almuerzo: "Vuelve",
  salida: "Salida",
};

export function esTipoMarcacion(valor: string): valor is TipoMarcacion {
  return (TIPOS_MARCACION as string[]).includes(valor);
}

/**
 * Hasta cuántas horas después de la última marcación un turno sigue "abierto". Pasado ese
 * tiempo se entiende que se olvidó de marcar la salida y se arranca un turno nuevo. Alcanza
 * para un turno nocturno que cruza la medianoche.
 */
export const HORAS_TURNO_ABIERTO = 18;

/** Entre una marcación y la siguiente de la misma persona tienen que pasar al menos estos segundos (evita el doble toque). */
export const SEGUNDOS_ENTRE_MARCAS = 45;

/** Cuántas veces puede errarle al PIN antes de que se bloquee, y por cuántos minutos. */
export const MAXIMO_INTENTOS_PIN = 5;
export const MINUTOS_BLOQUEO_PIN = 5;

/** Una marcación ya hecha, tal como se le muestra a la persona en el celular fijo: qué fue y a qué hora ("08:03"). */
export type MarcaReciente = { tipo: TipoMarcacion; hora: string };

/** Qué puede marcar ahora, según lo último que marcó (null = nada reciente, o el turno ya cerró). */
export function marcacionesPermitidas(ultimo: TipoMarcacion | null): TipoMarcacion[] {
  switch (ultimo) {
    case null:
    case "salida":
      return ["entrada"];
    case "entrada":
      // Sin almuerzo puede salir directo.
      return ["salida_almuerzo", "salida"];
    case "salida_almuerzo":
      // Si no vuelve, se va: también puede marcar la salida.
      return ["vuelta_almuerzo", "salida"];
    case "vuelta_almuerzo":
      return ["salida"];
  }
}

/** El PIN: de 4 a 6 números. */
export function pinValido(pin: string): boolean {
  return /^\d{4,6}$/.test(pin);
}

/** "HH:MM" de 24 horas. */
export function horaValida(hora: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(hora);
}

function minutosDeHora(hora: string): number {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Los minutos que llegó tarde. `horaEntrada` es a la que tenía que entrar y `horaMarcada` a la
 * que marcó (las dos "HH:MM"). Dentro de la tolerancia es 0; pasada la tolerancia cuenta TODO el
 * atraso desde la hora de entrada (si entra a las 8:00 con 10 de tolerancia y marca 8:12, llegó
 * 12 minutos tarde). NULL si no se le controla la tardanza.
 */
export function calcularTardanza(
  horaEntrada: string | null,
  toleranciaMin: number,
  horaMarcada: string
): number | null {
  if (!horaEntrada || !horaValida(horaEntrada) || !horaValida(horaMarcada)) return null;
  const atraso = minutosDeHora(horaMarcada) - minutosDeHora(horaEntrada);
  return atraso > toleranciaMin ? atraso : 0;
}

/** Deja solo los gestos que existen: lo que manda el celular nunca se guarda tal cual. */
export function gestosValidos(valor: unknown): string[] {
  if (!Array.isArray(valor)) return [];
  const conocidos = Object.keys(GESTOS);
  return valor.filter((g): g is string => typeof g === "string" && conocidos.includes(g)).slice(0, 3);
}

/** "8 h 05 min", "45 min", "—" si no hay dato. */
export function formatearDuracion(minutos: number | null): string {
  if (minutos === null) return "—";
  const total = Math.max(0, Math.round(minutos));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  return `${h} h ${String(m).padStart(2, "0")} min`;
}

// ---------------------------------------------------------------------------
//  El reporte: de marcaciones sueltas a turnos
// ---------------------------------------------------------------------------

/** Una persona del registro de asistencia, como la ven las pantallas del panel (nunca lleva el PIN). */
export type ColaboradorFila = {
  id: string;
  nombre: string;
  apellido: string | null;
  cargo: string | null;
  fotoUrl: string | null;
  horaEntrada: string | null;
  toleranciaMin: number;
  activo: boolean;
  /** true = se bloqueó por errarle varias veces al PIN y todavía no pasó el tiempo. */
  bloqueado: boolean;
};

export function nombreDeColaborador(c: { nombre: string; apellido: string | null }): string {
  return [c.nombre, c.apellido].filter(Boolean).join(" ");
}

/** Lo que el reporte necesita saber de cada marcación. */
export type MarcaDeTurno = {
  id: string;
  tipo: string;
  fecha: Date;
  tardanzaMin: number | null;
  verificada: boolean;
};

export type EstadoTurno = "completo" | "en_curso" | "incompleto";

export type Turno<M extends MarcaDeTurno = MarcaDeTurno> = {
  entrada: M | null;
  salidaAlmuerzo: M | null;
  vueltaAlmuerzo: M | null;
  salida: M | null;
  /** Lo que trabajó, sin el almuerzo. NULL si el turno no se cerró (falta la entrada o la salida). */
  minutosTrabajados: number | null;
  /** Lo que duró el almuerzo. NULL si no marcó las dos puntas. */
  minutosAlmuerzo: number | null;
  /** Minutos de tardanza de la entrada (0 = a tiempo, NULL = no se controla). */
  tardanzaMin: number | null;
  estado: EstadoTurno;
  /** Lo que conviene revisar: "No marcó la salida", "Sin verificar"… */
  avisos: string[];
};

function entreMinutos(desde: Date, hasta: Date): number {
  return Math.max(0, Math.round((hasta.getTime() - desde.getTime()) / 60000));
}

/**
 * Arma los turnos de UNA persona en UN día a partir de sus marcaciones. Casi siempre es uno solo,
 * pero quien hace turno cortado (mañana y tarde) entra y sale dos veces el mismo día: cada entrada
 * abre un turno nuevo. `hoy` es la jornada de hoy ("YYYY-MM-DD"): un turno sin salida de hoy está
 * "en curso"; el de un día anterior quedó "incompleto" (se olvidó de marcar).
 */
export function armarTurnos<M extends MarcaDeTurno>(marcas: M[], dia: string, hoy: string): Turno<M>[] {
  const ordenadas = [...marcas].sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
  const turnos: Turno<M>[] = [];
  let actual: Turno<M> | null = null;

  const nuevo = (): Turno<M> => ({
    entrada: null,
    salidaAlmuerzo: null,
    vueltaAlmuerzo: null,
    salida: null,
    minutosTrabajados: null,
    minutosAlmuerzo: null,
    tardanzaMin: null,
    estado: "incompleto",
    avisos: [],
  });

  for (const marca of ordenadas) {
    if (marca.tipo === "entrada") {
      actual = nuevo();
      actual.entrada = marca;
      turnos.push(actual);
      continue;
    }
    // Una marcación sin entrada antes (se le olvidó marcarla): abre un turno sin entrada.
    if (!actual) {
      actual = nuevo();
      turnos.push(actual);
    }
    if (marca.tipo === "salida_almuerzo" && !actual.salidaAlmuerzo) actual.salidaAlmuerzo = marca;
    else if (marca.tipo === "vuelta_almuerzo" && !actual.vueltaAlmuerzo) actual.vueltaAlmuerzo = marca;
    else if (marca.tipo === "salida" && !actual.salida) {
      actual.salida = marca;
      // La salida cierra el turno: lo que venga después es otro.
      actual = null;
    }
  }

  for (const t of turnos) {
    if (t.salidaAlmuerzo && t.vueltaAlmuerzo) {
      t.minutosAlmuerzo = entreMinutos(t.salidaAlmuerzo.fecha, t.vueltaAlmuerzo.fecha);
    }
    if (t.entrada && t.salida) {
      const bruto = entreMinutos(t.entrada.fecha, t.salida.fecha);
      t.minutosTrabajados = Math.max(0, bruto - (t.minutosAlmuerzo ?? 0));
    }
    t.tardanzaMin = t.entrada ? t.entrada.tardanzaMin : null;

    if (t.entrada && t.salida) t.estado = "completo";
    else if (t.entrada && !t.salida && dia === hoy) t.estado = "en_curso";
    else t.estado = "incompleto";

    if (!t.entrada) t.avisos.push("No marcó la entrada");
    if (t.entrada && !t.salida && t.estado === "incompleto") t.avisos.push("No marcó la salida");
    if (t.salidaAlmuerzo && !t.vueltaAlmuerzo && (t.salida || t.estado === "incompleto")) {
      t.avisos.push("No marcó la vuelta del almuerzo");
    }
    if (t.tardanzaMin !== null && t.tardanzaMin > 0) t.avisos.push(`Llegó ${t.tardanzaMin} min tarde`);
    const todas = [t.entrada, t.salidaAlmuerzo, t.vueltaAlmuerzo, t.salida];
    if (todas.some((m) => m && !m.verificada)) t.avisos.push("Marcó sin la prueba de persona real");
  }

  return turnos;
}

/** Lo que se muestra de una marcación en la tabla del reporte (todo ya en texto, listo para pantalla). */
export type CeldaMarca = {
  id: string;
  /** "08:03", en hora de Asunción. */
  hora: string;
  fotoUrl: string | null;
  verificada: boolean;
  /** Los gestos que hizo, ya en palabras: ["parpadeo", "boca abierta"]. */
  gestos: string[];
  tardanzaMin: number | null;
};

/** Una fila del reporte: un turno de una persona en un día. */
export type FilaAsistencia = {
  clave: string;
  dia: string;
  diaTexto: string;
  colaboradorId: string;
  nombre: string;
  cargo: string | null;
  fotoAlta: string | null;
  celdas: Record<TipoMarcacion, CeldaMarca | null>;
  trabajado: string;
  almuerzo: string;
  estado: EstadoTurno;
  avisos: string[];
};
