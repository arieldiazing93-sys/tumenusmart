/**
 * Reserva de canchas (complejos deportivos): las reglas, en limpio.
 *
 * Puro (sin Prisma ni reloj propio: la hora de "ahora" entra como dato) para poder probarlo con casos reales. Lo usan la
 * página pública (qué horarios se ofrecen), la acción que crea la reserva (que vuelve a comprobar todo), el calendario del
 * panel y el editor de canchas: así todos dicen siempre lo mismo.
 *
 * Es el espejo de la Reserva de turnos (src/lib/disponibilidad.ts) con tres diferencias de fondo:
 *  - lo que se reserva es una CANCHA (no una persona) y por una DURACIÓN que elige el cliente: 1 h, 1 h 30, 2 h…;
 *  - los horarios arrancan cada 30 minutos o cada hora (los que elige el negocio para esa cancha), no cada 15;
 *  - el precio depende de la duración y de la hora: hay una tarifa de día y, si el negocio quiere, otra de noche (la luz).
 *
 * Todo en minutos desde la medianoche, en hora de Asunción.
 */

import { diaDeLaSemana, esEstadoCita, type EstadoCita } from "./agenda";
import { normalizarTelefonoCliente } from "./agenda-personal";
import { claveSumarDias } from "./calendario";
import { ANTICIPACION_MIN, DIAS_ADELANTE, tramosDeTrabajo, type Ocupado } from "./disponibilidad";
import { formatearGuarani } from "./format";
import { aMinutos, esHoraValida, type HorarioDia } from "./horario-trabajo";
import type { ClienteLimpio } from "./reserva-cliente";

// ---------------------------------------------------------------------------
//  Tipos de cancha
// ---------------------------------------------------------------------------

export type DeporteCancha =
  | "futbol5"
  | "futbol7"
  | "futbol11"
  | "futsal"
  | "padel"
  | "tenis"
  | "voley"
  | "basquet"
  | "otro";

/** Los tipos que se ofrecen, en el orden en que aparecen. `otro` sirve para cualquier deporte que no esté. */
export const DEPORTES_CANCHA: { valor: DeporteCancha; etiqueta: string }[] = [
  { valor: "futbol5", etiqueta: "Fútbol 5" },
  { valor: "futbol7", etiqueta: "Fútbol 7" },
  { valor: "futbol11", etiqueta: "Fútbol 11" },
  { valor: "futsal", etiqueta: "Fútbol de salón" },
  { valor: "padel", etiqueta: "Pádel" },
  { valor: "tenis", etiqueta: "Tenis" },
  { valor: "voley", etiqueta: "Vóley" },
  { valor: "basquet", etiqueta: "Básquet" },
  { valor: "otro", etiqueta: "Otro deporte" },
];

export function esDeporteCancha(valor: unknown): valor is DeporteCancha {
  return DEPORTES_CANCHA.some((d) => d.valor === valor);
}

/** Un valor guardado que no se conoce cae en "otro". */
export function normalizarDeporte(valor: unknown): DeporteCancha {
  return esDeporteCancha(valor) ? valor : "otro";
}

export function etiquetaDeDeporte(valor: unknown): string {
  return DEPORTES_CANCHA.find((d) => d.valor === valor)?.etiqueta ?? "Otro deporte";
}

// ---------------------------------------------------------------------------
//  Duraciones y paso
// ---------------------------------------------------------------------------

/** Las duraciones que un negocio puede ofrecer, en minutos. */
export const DURACIONES_DISPONIBLES = [60, 90, 120, 150, 180] as const;
/** Lo que ofrece una cancha nueva: una hora, hora y media, dos horas. */
export const DURACIONES_POR_DEFECTO: number[] = [60, 90, 120];
/** Cada cuántos minutos puede arrancar un horario. */
export const PASOS_DE_CANCHA = [30, 60] as const;
export const PASO_POR_DEFECTO = 30;

/** 60 → "1 hora", 90 → "1 h 30", 120 → "2 horas", 150 → "2 h 30". */
export function textoDuracionCancha(minutos: number): string {
  if (!Number.isFinite(minutos) || minutos <= 0) return "";
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  if (horas === 0) return `${resto} min`;
  if (resto === 0) return horas === 1 ? "1 hora" : `${horas} horas`;
  return `${horas} h ${String(resto).padStart(2, "0")}`;
}

/**
 * Las duraciones que llegaron, limpias: solo las que existen, sin repetidos y de menor a mayor. Si no queda ninguna
 * (nada marcado, algo roto) vuelve a las de siempre: una cancha sin duraciones no se podría reservar.
 */
export function limpiarDuraciones(valor: unknown): number[] {
  const lista = Array.isArray(valor) ? valor : [];
  const vistas = new Set<number>();
  for (const v of lista) {
    const n = Number(v);
    if ((DURACIONES_DISPONIBLES as readonly number[]).includes(n)) vistas.add(n);
  }
  const limpias = [...vistas].sort((a, b) => a - b);
  return limpias.length > 0 ? limpias : [...DURACIONES_POR_DEFECTO];
}

export function normalizarPaso(valor: unknown): number {
  const n = Number(valor);
  return (PASOS_DE_CANCHA as readonly number[]).includes(n) ? n : PASO_POR_DEFECTO;
}

/** La duración de una reserva cargada a mano desde el panel: múltiplo de 30 minutos, de media hora a ocho horas. */
export function duracionManualValida(minutos: unknown): minutos is number {
  return typeof minutos === "number" && Number.isInteger(minutos) && minutos >= 30 && minutos <= 480 && minutos % 30 === 0;
}

// ---------------------------------------------------------------------------
//  Precio
// ---------------------------------------------------------------------------

/** Lo más que se acepta de precio por hora (un error de tipeo con un cero de más no pasa). */
export const PRECIO_MAXIMO_CANCHA = 10_000_000;

export type Tarifa = {
  precioHora: number;
  /** null = la cancha no tiene tarifa de noche. */
  precioNocturnoHora: number | null;
  /** "HH:MM": desde qué hora rige la tarifa de noche. */
  nocheDesde: string;
};

const BLOQUE_TARIFA_MIN = 30;

/**
 * Lo que cuesta jugar `duracionMin` minutos desde `inicioMin`. Se cobra por media hora, con la tarifa que rige a la hora en
 * que empieza cada media hora: un partido de 17:30 a 19:00 con noche desde las 18:00 paga media hora de día y una hora de
 * noche. El resultado es siempre un guaraní entero.
 */
export function precioDeReserva(tarifa: Tarifa, inicioMin: number, duracionMin: number): number {
  const noche =
    tarifa.precioNocturnoHora != null && esHoraValida(tarifa.nocheDesde) ? aMinutos(tarifa.nocheDesde) : null;
  let suma = 0;
  for (let desde = inicioMin; desde < inicioMin + duracionMin; desde += BLOQUE_TARIFA_MIN) {
    const minutos = Math.min(BLOQUE_TARIFA_MIN, inicioMin + duracionMin - desde);
    const porHora = noche !== null && desde >= noche ? (tarifa.precioNocturnoHora as number) : tarifa.precioHora;
    suma += (porHora * minutos) / 60;
  }
  return Math.round(suma);
}

// ---------------------------------------------------------------------------
//  Qué horas se pueden reservar
// ---------------------------------------------------------------------------

/** "23:59" como hora de cierre significa que el complejo cierra a la medianoche (24:00). */
const MINUTO_ULTIMO_DEL_DIA = 23 * 60 + 59;
const MINUTOS_DEL_DIA = 24 * 60;

/**
 * El horario que se ofrece mientras el complejo no configuró el suyo: todos los días de 08:00 a la medianoche, sin
 * descanso. Recién cuenta cuando el dueño lo guarda en Horario del complejo.
 */
export function horarioCanchasPorDefecto(): HorarioDia[] {
  return [1, 2, 3, 4, 5, 6, 0].map((diaSemana) => ({
    diaSemana,
    trabaja: true,
    inicio: "08:00",
    fin: "23:59",
    descansa: false,
    descansoInicio: "13:00",
    descansoFin: "14:00",
  }));
}

/** La hora de cierre como se lee: "23:59" es la medianoche ("24:00"). */
export function textoDeCierre(fin: string): string {
  return fin === "23:59" ? "24:00" : fin;
}

/** Los siete días en orden de semana; los que falten se completan con el horario por defecto del complejo. */
export function completarHorarioCanchas(filas: HorarioDia[]): HorarioDia[] {
  return horarioCanchasPorDefecto().map((base) => filas.find((f) => f.diaSemana === base.diaSemana) ?? base);
}

/**
 * Los tramos en que está abierto un día. Igual que en la Reserva de turnos (el descanso lo parte en dos), con una diferencia:
 * un cierre a las 23:59 se toma como la medianoche, porque un complejo que cierra a las 24:00 no puede escribir "24:00".
 */
export function tramosDeCancha(h: HorarioDia | undefined): { desde: number; hasta: number }[] {
  return tramosDeTrabajo(h).map((t) => ({
    desde: t.desde,
    hasta: t.hasta >= MINUTO_ULTIMO_DEL_DIA ? MINUTOS_DEL_DIA : t.hasta,
  }));
}

/**
 * Las horas de inicio libres de un día para una reserva de `duracion` minutos: cada `paso` minutos desde que abre cada
 * tramo, sin pisar el descanso ni pasarse del cierre, no antes de `minutoMinimo` y sin tocar una reserva ya tomada.
 * Una reserva que termina justo cuando empieza la otra no la pisa (18:00–19:30 y 19:30–21:00 conviven).
 */
export function horasLibresCancha(datos: {
  horario: HorarioDia | undefined;
  ocupados: Ocupado[];
  duracion: number;
  paso: number;
  /** Nada antes de este minuto (para hoy: la hora de ahora más la anticipación). */
  minutoMinimo: number;
}): number[] {
  const { horario, ocupados, duracion, paso, minutoMinimo } = datos;
  if (duracion <= 0 || paso <= 0) return [];
  const libres: number[] = [];
  for (const tramo of tramosDeCancha(horario)) {
    for (let inicio = tramo.desde; inicio + duracion <= tramo.hasta; inicio += paso) {
      if (inicio < minutoMinimo) continue;
      const fin = inicio + duracion;
      if (ocupados.some((o) => inicio < o.hasta && fin > o.desde)) continue;
      libres.push(inicio);
    }
  }
  return libres;
}

/** El primer minuto reservable de hoy: ahora más la anticipación. */
export function minutoMinimoDeHoyCancha(minutosAhora: number): number {
  return minutosAhora + ANTICIPACION_MIN;
}

/**
 * Las horas libres de cada día de los próximos `DIAS_ADELANTE` días para una cancha y una duración:
 * `{ "2026-09-25": [1080, 1110, …] }`. Los días sin ninguna hora libre (cerrado, todo ocupado, ya pasó) no aparecen.
 */
export function horasDelPeriodoCancha(datos: {
  /** Los siete días del horario del complejo. */
  horarios: HorarioDia[];
  /** Lo ya reservado en esa cancha, por día ("YYYY-MM-DD"). */
  ocupadosPorDia: Map<string, Ocupado[]>;
  duracion: number;
  paso: number;
  /** "YYYY-MM-DD" de hoy en Asunción. */
  hoy: string;
  /** La hora de ahora, en minutos desde la medianoche de hoy. */
  minutosAhora: number;
}): Record<string, number[]> {
  const salida: Record<string, number[]> = {};
  for (let i = 0; i < DIAS_ADELANTE; i++) {
    const dia = claveSumarDias(datos.hoy, i);
    const libres = horasLibresCancha({
      horario: datos.horarios.find((h) => h.diaSemana === diaDeLaSemana(dia)),
      ocupados: datos.ocupadosPorDia.get(dia) ?? [],
      duracion: datos.duracion,
      paso: datos.paso,
      minutoMinimo: i === 0 ? minutoMinimoDeHoyCancha(datos.minutosAhora) : 0,
    });
    if (libres.length > 0) salida[dia] = libres;
  }
  return salida;
}

/** Las horas libres de una cancha para CADA una de sus duraciones: `{ 60: {día: [...]}, 90: {...} }`. */
export function horasPorDuracion(datos: {
  horarios: HorarioDia[];
  ocupadosPorDia: Map<string, Ocupado[]>;
  duraciones: number[];
  paso: number;
  hoy: string;
  minutosAhora: number;
}): Record<number, Record<string, number[]>> {
  const salida: Record<number, Record<string, number[]>> = {};
  for (const duracion of datos.duraciones) {
    salida[duracion] = horasDelPeriodoCancha({ ...datos, duracion });
  }
  return salida;
}

/** ¿Pisa este tramo alguno de los ya ocupados? (para anotar a mano desde el panel, sin las reglas del horario). */
export function hayChoque(ocupados: Ocupado[], desde: number, hasta: number): boolean {
  return ocupados.some((o) => desde < o.hasta && hasta > o.desde);
}

// ---------------------------------------------------------------------------
//  Lo que la página le muestra al cliente
// ---------------------------------------------------------------------------

export type CanchaPublica = {
  id: string;
  nombre: string;
  deporte: DeporteCancha;
  superficie: string | null;
  techada: boolean;
  descripcion: string | null;
  fotoUrl: string | null;
  precioHora: number;
  precioNocturnoHora: number | null;
  nocheDesde: string;
  duraciones: number[];
  pasoMin: number;
};

/** Una cancha y su próxima disponibilidad (para elegirla en el primer paso). */
export type ProximaCancha = {
  canchaId: string;
  /** "YYYY-MM-DD" del primer día con horas libres, o null si no hay en los próximos días. */
  fecha: string | null;
  /** Las primeras horas libres de ese día ("18:00", "18:30"…), para la duración más corta. */
  horas: string[];
};

/** Lo que devuelve la acción al crear la reserva. */
export type ReservaCreada = {
  reservaId: string;
  codigo: string;
  fechaTexto: string;
  horaInicio: string;
  horaFin: string;
  canchaNombre: string;
  duracionMin: number;
  total: number;
  /** Para abrir WhatsApp con el resumen; null si el negocio no pide aviso por WhatsApp. */
  enlaceWhatsapp: string | null;
  /** true si la reserva recién aparece en el calendario del negocio cuando el cliente manda el aviso. */
  esperaEnvio: boolean;
  /** Cuántos segundos tiene el cliente para mandar el aviso antes de que la reserva se cancele; null si no hay nada que esperar. */
  venceEnSegundos: number | null;
};

/** Un código corto para reconocer la reserva en la conversación: los últimos 6 caracteres del id. */
export function codigoDeReserva(id: string): string {
  return id.slice(-6).toUpperCase();
}

/** El mensaje que el cliente le manda al negocio con el resumen de su reserva. */
export function mensajeWhatsappReservaCancha(x: {
  negocio: string;
  cliente: ClienteLimpio;
  canchaNombre: string;
  deporte: string;
  /** Ya escrita: "Viernes 25 sep". */
  fechaTexto: string;
  horaInicio: string;
  horaFin: string;
  duracionMin: number;
  total: number;
  codigo: string;
}): string {
  // Cada concepto con dos puntos va en negrita (en WhatsApp, entre asteriscos) para distinguirlo de lo que escribió el cliente.
  const campo = (concepto: string, valor: string) => `*${concepto}:* ${valor}`;
  const lineas = [
    `Hola ${x.negocio}, quiero confirmar mi reserva de cancha:`,
    "",
    campo("Cliente", [x.cliente.nombre, x.cliente.apellido].filter(Boolean).join(" ")),
    ...(x.cliente.telefono ? [campo("Teléfono", `+${x.cliente.telefono}`)] : []),
    campo("Cancha", `${x.canchaNombre} (${x.deporte})`),
    campo("Día", x.fechaTexto),
    campo("Hora", `${x.horaInicio} a ${x.horaFin} (${textoDuracionCancha(x.duracionMin)})`),
    campo("Total", formatearGuarani(x.total)),
    ...x.cliente.extras.map((e) => campo(e.etiqueta, e.valor)),
    "",
    `Reserva ${x.codigo}`,
  ];
  return lineas.join("\n");
}

// ---------------------------------------------------------------------------
//  La ficha de una cancha (lo que escribe el dueño)
// ---------------------------------------------------------------------------

/** Lo que llega del formulario de la cancha, tal como se escribe. */
export type DatosCancha = {
  nombre: string;
  deporte: string;
  superficie: string;
  techada: boolean;
  descripcion: string;
  fotoUrl: string;
  precioHora: string;
  precioNocturnoHora: string;
  nocheDesde: string;
  duraciones: number[];
  pasoMin: number;
  activa: boolean;
};

export type CanchaLimpia = {
  nombre: string;
  deporte: DeporteCancha;
  superficie: string | null;
  techada: boolean;
  descripcion: string | null;
  fotoUrl: string | null;
  precioHora: number;
  precioNocturnoHora: number | null;
  nocheDesde: string;
  duraciones: number[];
  pasoMin: number;
  activa: boolean;
};

function texto(valor: unknown, max: number): string {
  return typeof valor === "string" ? valor.trim().slice(0, max) : "";
}

/** Un precio escrito ("80.000", "80000", "80 000"): solo guaraníes enteros. null si está mal escrito. */
export function leerPrecioCancha(valor: unknown): number | null {
  const crudo = typeof valor === "number" ? String(valor) : typeof valor === "string" ? valor : "";
  const limpio = crudo.replace(/[\s.]/g, "").replace(/,0+$/, "");
  if (!/^\d{1,9}$/.test(limpio)) return null;
  return Number(limpio);
}

/**
 * Revisa lo que mandó el navegador y lo deja listo para guardar. Nada se guarda tal cual: se arman valores nuevos con
 * solo lo que corresponde, y lo que no cumple se rechaza con un mensaje que la persona entienda.
 */
export function sanearCancha(entrada: unknown): { ok: true; cancha: CanchaLimpia } | { ok: false; error: string } {
  if (!entrada || typeof entrada !== "object" || Array.isArray(entrada)) {
    return { ok: false, error: "Lo que llegó no es válido. Recargá la página." };
  }
  const e = entrada as Record<string, unknown>;

  const nombre = texto(e.nombre, 60);
  if (!nombre) return { ok: false, error: "Poné el nombre de la cancha (por ejemplo: Cancha 1)" };

  if (!esDeporteCancha(e.deporte)) return { ok: false, error: "Elegí el tipo de cancha" };

  const precioHora = leerPrecioCancha(e.precioHora);
  if (precioHora === null || precioHora <= 0) return { ok: false, error: "Poné lo que cuesta una hora de la cancha" };
  if (precioHora > PRECIO_MAXIMO_CANCHA) {
    return { ok: false, error: `El precio por hora no puede pasar de ${formatearGuarani(PRECIO_MAXIMO_CANCHA)}` };
  }

  // La tarifa de noche es opcional: vacía = la cancha cuesta lo mismo todo el día.
  let precioNocturnoHora: number | null = null;
  const escritoNoche = typeof e.precioNocturnoHora === "string" ? e.precioNocturnoHora.trim() : e.precioNocturnoHora;
  if (escritoNoche !== "" && escritoNoche !== null && escritoNoche !== undefined) {
    const n = leerPrecioCancha(escritoNoche);
    if (n === null || n <= 0) return { ok: false, error: "El precio de la hora de noche no es válido" };
    if (n > PRECIO_MAXIMO_CANCHA) {
      return { ok: false, error: `El precio de noche no puede pasar de ${formatearGuarani(PRECIO_MAXIMO_CANCHA)}` };
    }
    precioNocturnoHora = n;
  }

  const nocheDesde = typeof e.nocheDesde === "string" && esHoraValida(e.nocheDesde) ? e.nocheDesde : "18:00";

  const fotoUrl = texto(e.fotoUrl, 500);
  if (fotoUrl && !/^https:\/\//i.test(fotoUrl)) return { ok: false, error: "La foto no es válida. Subila de nuevo." };

  return {
    ok: true,
    cancha: {
      nombre,
      deporte: e.deporte,
      superficie: texto(e.superficie, 40) || null,
      techada: e.techada === true,
      descripcion: texto(e.descripcion, 300) || null,
      fotoUrl: fotoUrl || null,
      precioHora,
      precioNocturnoHora,
      nocheDesde,
      duraciones: limpiarDuraciones(e.duraciones),
      pasoMin: normalizarPaso(e.pasoMin),
      activa: e.activa !== false,
    },
  };
}

/** Una cancha como la muestra la lista del panel (y si ya tuvo reservas, para saber si se puede borrar). */
export type CanchaFila = CanchaPublica & {
  activa: boolean;
  tieneReservas: boolean;
};

// ---------------------------------------------------------------------------
//  Una reserva cargada desde el panel (por teléfono, en el mostrador)
// ---------------------------------------------------------------------------

/** Lo más que se acepta de precio en una reserva anotada a mano. */
export const PRECIO_MAXIMO_RESERVA = 100_000_000;

/** Lo que llega del panel al anotar o editar una reserva. */
export type DatosReservaPanel = {
  canchaId: string;
  /** "YYYY-MM-DD" */
  fecha: string;
  /** "HH:MM" */
  hora: string;
  /** Minutos. */
  duracion: number;
  clienteNombre: string;
  /** Como lo escribió la persona (puede traer espacios, el 0 inicial…). */
  clienteTelefono: string;
  nota: string;
  /** Guaraníes enteros. */
  precio: number;
  estado: string;
  /** Guardar igual aunque la hora quede fuera del horario del complejo. */
  forzar?: boolean;
};

export type ReservaPanelLimpia = {
  canchaId: string;
  fecha: string;
  hora: string;
  duracion: number;
  clienteNombre: string;
  /** Internacional, solo dígitos. */
  clienteTelefono: string | null;
  nota: string | null;
  precio: number;
  estado: EstadoCita;
  forzar: boolean;
};

/**
 * Revisa lo que mandó el panel y lo deja listo para guardar. Nada se guarda tal cual: los textos se recortan, el teléfono
 * se normaliza y todo lo demás se rechaza con un mensaje que la persona entienda. La cancha y el choque con otras
 * reservas los comprueba el servidor contra la base.
 */
export function sanearReservaPanel(
  entrada: unknown
): { ok: true; reserva: ReservaPanelLimpia } | { ok: false; error: string } {
  if (!entrada || typeof entrada !== "object" || Array.isArray(entrada)) {
    return { ok: false, error: "Lo que llegó no es válido. Recargá la página." };
  }
  const e = entrada as Record<string, unknown>;

  const canchaId = typeof e.canchaId === "string" ? e.canchaId : "";
  if (!canchaId) return { ok: false, error: "Elegí la cancha" };

  const fecha = typeof e.fecha === "string" ? e.fecha : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || claveSumarDias(fecha, 0) !== fecha) {
    return { ok: false, error: "El día no es válido" };
  }
  const hora = typeof e.hora === "string" ? e.hora : "";
  if (!esHoraValida(hora)) return { ok: false, error: "La hora no es válida" };

  if (!duracionManualValida(e.duracion)) {
    return { ok: false, error: "La duración no es válida (entre media hora y ocho horas, de a media hora)" };
  }
  if (aMinutos(hora) + e.duracion > MINUTOS_DEL_DIA) {
    return { ok: false, error: "La reserva no puede pasar de la medianoche. Acortala o empezala antes." };
  }

  const clienteNombre = texto(e.clienteNombre, 200);
  if (!clienteNombre) return { ok: false, error: "Escribí el nombre del cliente" };
  if (clienteNombre.length > 80) return { ok: false, error: "El nombre puede tener hasta 80 letras" };

  let clienteTelefono: string | null = null;
  const telefonoEscrito = texto(e.clienteTelefono, 40);
  if (telefonoEscrito) {
    const t = normalizarTelefonoCliente(telefonoEscrito);
    if (!t.ok) return { ok: false, error: t.error };
    clienteTelefono = t.telefono;
  }

  const nota = texto(e.nota, 300);

  const precio = typeof e.precio === "number" ? e.precio : Number.NaN;
  if (!Number.isInteger(precio) || precio < 0 || precio > PRECIO_MAXIMO_RESERVA) {
    return { ok: false, error: "El precio no es válido" };
  }

  if (typeof e.estado !== "string" || !esEstadoCita(e.estado)) return { ok: false, error: "El estado no es válido" };

  return {
    ok: true,
    reserva: {
      canchaId,
      fecha,
      hora,
      duracion: e.duracion,
      clienteNombre,
      clienteTelefono,
      nota: nota || null,
      precio,
      estado: e.estado,
      forzar: e.forzar === true,
    },
  };
}

/** Si el estado deja libre el horario (la reserva se cayó o no vino): no ocupa la cancha. */
export function estadoLiberaHorario(estado: string): boolean {
  return estado === "cancelada" || estado === "no_asistio";
}

// ---------------------------------------------------------------------------
//  Lo que dice la dirección del calendario
// ---------------------------------------------------------------------------

export type ParametrosCanchas = {
  /** "YYYY-MM-DD" */
  fecha: string;
  /** Un tipo de cancha (clave de DEPORTES_CANCHA) o null para ver todas. */
  tipo: string | null;
  /** Mostrar también las reservas canceladas. */
  canceladas: boolean;
};

/** La dirección del calendario con estos parámetros, cambiando solo lo que se pida. */
export function urlCanchas(base: ParametrosCanchas, cambios: Partial<ParametrosCanchas> = {}): string {
  const p = { ...base, ...cambios };
  const consulta = new URLSearchParams();
  consulta.set("fecha", p.fecha);
  if (p.tipo) consulta.set("tipo", p.tipo);
  if (p.canceladas) consulta.set("canceladas", "1");
  return `/admin/canchas?${consulta.toString()}`;
}

/** La dirección del calendario con el panel de una reserva abierto (o una nueva, con la cancha y la hora ya elegidas). */
export function urlReservaCancha(
  base: ParametrosCanchas,
  reserva: string,
  precarga: { cancha?: string; hora?: string } = {}
): string {
  const extra = new URLSearchParams();
  extra.set("reserva", reserva);
  if (precarga.cancha) extra.set("cancha", precarga.cancha);
  if (precarga.hora) extra.set("hora", precarga.hora);
  return `${urlCanchas(base)}&${extra.toString()}`;
}

// ---------------------------------------------------------------------------
//  El tablero de la página pública: todas las canchas de un día de un vistazo
// ---------------------------------------------------------------------------

/** Para cada día, cada cancha y cada duración, las horas de inicio libres (minutos). */
export type DisponibilidadPorDia = Record<string, Record<string, Record<number, number[]>>>;

/** Cuántos días trae de una vez el tablero (se piden más al deslizar la tira de días). */
export const DIAS_POR_VENTANA = 14;

/**
 * Da vuelta lo que calcula el servidor por cancha (`canchaId → duración → día → horas`) para que el tablero lo lea por día
 * (`día → canchaId → duración → horas`), recortado a una ventana de `cantidad` días desde `desde`. Los días y canchas sin
 * ninguna hora libre no aparecen.
 */
export function ventanaDeDisponibilidad(
  porCancha: Map<string, Record<number, Record<string, number[]>>>,
  desde: string,
  cantidad: number
): DisponibilidadPorDia {
  const salida: DisponibilidadPorDia = {};
  for (let i = 0; i < cantidad; i++) {
    const dia = claveSumarDias(desde, i);
    for (const [canchaId, porDuracion] of porCancha) {
      for (const [duracion, dias] of Object.entries(porDuracion)) {
        const horas = dias[dia];
        if (!horas || horas.length === 0) continue;
        const delDia = (salida[dia] ??= {});
        const dela = (delDia[canchaId] ??= {});
        dela[Number(duracion)] = horas;
      }
    }
  }
  return salida;
}

// ---------------------------------------------------------------------------
//  Lo ocupado: se ve tachado en el tablero, no desaparece
// ---------------------------------------------------------------------------

/**
 * Los horarios que la cancha ofrecería ese día para esa duración si NO tuviera ninguna reserva (dentro del horario, fuera del
 * descanso y desde ahora) pero que hoy no se pueden tomar porque una reserva los pisa. Son los que el tablero muestra
 * tachados y en rojo: que se vea de un vistazo qué franja ya está ocupada en lugar de que el horario simplemente falte.
 */
export function horasOcupadasCancha(datos: {
  horario: HorarioDia | undefined;
  ocupados: Ocupado[];
  duracion: number;
  paso: number;
  minutoMinimo: number;
}): number[] {
  if (datos.ocupados.length === 0) return [];
  const libres = new Set(horasLibresCancha(datos));
  return horasLibresCancha({ ...datos, ocupados: [] }).filter((m) => !libres.has(m));
}

/** Lo ocupado de cada día de los próximos `DIAS_ADELANTE` días para una cancha y una duración (los días sin nada no aparecen). */
export function horasOcupadasDelPeriodoCancha(datos: {
  horarios: HorarioDia[];
  ocupadosPorDia: Map<string, Ocupado[]>;
  duracion: number;
  paso: number;
  hoy: string;
  minutosAhora: number;
}): Record<string, number[]> {
  const salida: Record<string, number[]> = {};
  for (let i = 0; i < DIAS_ADELANTE; i++) {
    const dia = claveSumarDias(datos.hoy, i);
    const ocupadas = horasOcupadasCancha({
      horario: datos.horarios.find((h) => h.diaSemana === diaDeLaSemana(dia)),
      ocupados: datos.ocupadosPorDia.get(dia) ?? [],
      duracion: datos.duracion,
      paso: datos.paso,
      minutoMinimo: i === 0 ? minutoMinimoDeHoyCancha(datos.minutosAhora) : 0,
    });
    if (ocupadas.length > 0) salida[dia] = ocupadas;
  }
  return salida;
}

/** Lo ocupado de una cancha para CADA una de sus duraciones: `{ 60: {día: [...]}, 90: {...} }`. */
export function horasOcupadasPorDuracion(datos: {
  horarios: HorarioDia[];
  ocupadosPorDia: Map<string, Ocupado[]>;
  duraciones: number[];
  paso: number;
  hoy: string;
  minutosAhora: number;
}): Record<number, Record<string, number[]>> {
  const salida: Record<number, Record<string, number[]>> = {};
  for (const duracion of datos.duraciones) {
    salida[duracion] = horasOcupadasDelPeriodoCancha({ ...datos, duracion });
  }
  return salida;
}
