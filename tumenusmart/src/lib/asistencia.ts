/**
 * Registro de asistencia — las reglas, sin base de datos ni pantalla (se pueden probar solas).
 *
 * Una persona marca cuatro cosas en el día: ENTRADA, SALIDA A ALMORZAR, VUELTA DEL ALMUERZO y
 * SALIDA. Lo que puede marcar en cada momento sale de lo último que marcó (no se puede marcar
 * dos veces la entrada ni salir sin haber entrado), y el almuerzo es opcional: quien no sale a
 * almorzar marca entrada y salida nomás.
 */

import { horaAsuncion } from "./timezone";

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
 * tiempo se entiende que se olvidó de marcar la salida y la próxima marcación es una entrada
 * nueva. Alcanza para un turno de 12 horas, también el nocturno que cruza la medianoche.
 */
export const HORAS_TURNO_ABIERTO = 14;

/** Lo que tienen que esperar entre una marcación y la siguiente de la misma persona, si el dueño no cambió el valor. */
export const MINUTOS_ENTRE_MARCAS_PREDETERMINADO = 5;
export const MINUTOS_ENTRE_MARCAS_MAXIMO = 240;

/**
 * Cuántos PIN incorrectos seguidos (sin ninguna marcación buena en el medio) aguanta el celular fijo antes de
 * bloquearse, y por cuántos minutos. Como el PIN es lo que identifica a la persona, no se puede bloquear "a esa
 * persona": se bloquea el celular.
 */
export const MAXIMO_INTENTOS_PIN = 5;
export const MINUTOS_BLOQUEO_PIN = 3;

/**
 * Cuántos días se guarda la FOTO de cada marcación. Pasado ese tiempo la foto se borra sola (ver
 * limpiar-fotos-asistencia.ts) y la marcación queda igual, con su hora: lo que importa es el registro, la foto sirve
 * para revisar si alguien marcó por otro. La selfie del alta del colaborador no se toca.
 */
export const DIAS_CONSERVAR_FOTOS_MARCACION = 30;

/** El horario de almuerzo del negocio (ver Store.almuerzoDesde / almuerzoHasta / almuerzoMaxMin). */
export type ReglasAlmuerzo = {
  /** "HH:MM": desde cuándo una marcación de quien ya entró cuenta como salida a almorzar. */
  desde: string;
  /** "HH:MM": hasta cuándo. */
  hasta: string;
  /** Lo máximo que puede pasar entre la salida a almorzar y la vuelta. */
  maxMin: number;
};

export const ALMUERZO_PREDETERMINADO: ReglasAlmuerzo = { desde: "11:00", hasta: "15:00", maxMin: 180 };
export const ALMUERZO_MAXIMO_MIN = 480;

/** ¿La hora ("HH:MM") cae dentro de la ventana de almuerzo? Acepta una ventana que cruza la medianoche. */
function enVentanaDeAlmuerzo(hora: string, reglas: ReglasAlmuerzo): boolean {
  const h = minutosDeHora(hora);
  const desde = minutosDeHora(reglas.desde);
  const hasta = minutosDeHora(reglas.hasta);
  return desde <= hasta ? h >= desde && h <= hasta : h >= desde || h <= hasta;
}

/**
 * Qué marcación es la que está haciendo la persona AHORA. No se la pregunta nadie: sale de lo último que marcó, de la
 * hora y del horario de almuerzo del negocio, porque en la vida real la secuencia no siempre se cumple completa (quien
 * pasa el día afuera en un soporte técnico no marca almuerzo, y quien se olvida de marcar lo deja pasar).
 *
 * - Sin turno abierto (nada reciente, o lo último fue la salida): ENTRADA.
 * - Ya entró: si marca dentro del horario de almuerzo (y esa persona almuerza), es SALIDA A ALMORZAR; fuera de ese
 *   horario es la SALIDA — quien volvió a la tarde de su trabajo afuera marca solo la salida y el reporte deja vacías
 *   las columnas del almuerzo.
 * - Salió a almorzar: si pasó menos del máximo de almuerzo, es la VUELTA; si pasó más, ya no volvió: es la SALIDA.
 * - Volvió del almuerzo: SALIDA.
 */
export function proximaMarcacion(
  ultima: { tipo: string; fecha: Date } | null,
  ahora: Date,
  haceAlmuerzo: boolean,
  reglas: ReglasAlmuerzo
): TipoMarcacion {
  const ultimo = ultima && esTipoMarcacion(ultima.tipo) ? ultima.tipo : null;
  switch (ultimo) {
    case null:
    case "salida":
      return "entrada";
    case "entrada":
      return haceAlmuerzo && enVentanaDeAlmuerzo(horaAsuncion(ahora), reglas) ? "salida_almuerzo" : "salida";
    case "salida_almuerzo": {
      const minutos = ultima ? (ahora.getTime() - ultima.fecha.getTime()) / 60_000 : Number.POSITIVE_INFINITY;
      return minutos <= reglas.maxMin ? "vuelta_almuerzo" : "salida";
    }
    case "vuelta_almuerzo":
      return "salida";
  }
}

/**
 * Si todavía no pasó el tiempo mínimo desde la última marcación, el aviso para la persona ("Ya marcaste entrada a las
 * 08:00. Podés marcar de nuevo a partir de las 08:05."); NULL si ya puede marcar. La hora se redondea hacia arriba al
 * minuto, así quien vuelve a la hora que se le dijo no se encuentra con que todavía faltan segundos.
 */
export function mensajeDeEspera(
  ultima: { tipo: string; fecha: Date } | null,
  minutosEntreMarcas: number,
  ahora: Date
): string | null {
  if (!ultima || minutosEntreMarcas <= 0) return null;
  const libre = new Date(Math.ceil((ultima.fecha.getTime() + minutosEntreMarcas * 60_000) / 60_000) * 60_000);
  if (ahora.getTime() >= libre.getTime()) return null;
  const que = esTipoMarcacion(ultima.tipo) ? ETIQUETA_TIPO[ultima.tipo].toLowerCase() : "recién";
  return `Ya marcaste ${que} a las ${horaAsuncion(ultima.fecha)}. Podés marcar de nuevo a partir de las ${horaAsuncion(libre)}.`;
}

/** Una marcación ya hecha, tal como se le muestra a la persona en el celular fijo: qué fue y a qué hora ("08:03"). */
export type MarcaReciente = { tipo: TipoMarcacion; hora: string };

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
  haceAlmuerzo: boolean;
  activo: boolean;
  /** true = todavía no tiene PIN (no puede marcar hasta que el dueño le ponga uno). */
  sinPin: boolean;
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

/**
 * Los minutos entre dos marcaciones, contados con las horas tal como se ven en pantalla (a minuto cumplido: 17:42:50 es
 * las 17:42). Así lo que se muestra siempre cierra: de 17:42 a 18:40 son 58 minutos, y si hubo 16 de almuerzo, 42 — sin
 * que el redondeo de los segundos de cada marcación se coma un minuto por el camino.
 */
function entreMinutos(desde: Date, hasta: Date): number {
  const aMinuto = (d: Date) => Math.floor(d.getTime() / 60000);
  return Math.max(0, aMinuto(hasta) - aMinuto(desde));
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
    if (todas.some((m) => m && !m.verificada)) t.avisos.push("La cámara no vio su cara al marcar: revisá la foto");
  }

  return turnos;
}

/** Lo que se muestra de una marcación en la tabla del reporte (todo ya en texto, listo para pantalla). */
export type CeldaMarca = {
  id: string;
  /** "08:03", en hora de Asunción. */
  hora: string;
  fotoUrl: string | null;
  /** La cámara vio su cara de frente al sacar la foto. false = marcó igual sin que la viera (revisar la foto). */
  verificada: boolean;
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
  /** Lo que trabajó, ya en texto ("8 h 05 min"; "—" si el turno no se cerró). */
  trabajado: string;
  almuerzo: string;
  /** Los mismos datos en minutos (NULL = no hay dato), para sumar y para el Excel. */
  minutosTrabajados: number | null;
  minutosAlmuerzo: number | null;
  /** Minutos de tardanza de la entrada (0 = a tiempo, NULL = no se controla). */
  tardanzaMin: number | null;
  estado: EstadoTurno;
  avisos: string[];
};
