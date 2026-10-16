/**
 * Registro de asistencia — los días de trabajo de cada persona, sus ausencias justificadas y la liquidación del período.
 * Todo son reglas puras (sin base de datos ni pantalla), así se prueban solas y la pantalla, el Excel y el PDF suman lo mismo.
 *
 * El criterio, en una frase: un día que la persona tiene que ir y no marcó es una FALTA SIN AVISO, salvo que el dueño haya
 * anotado por qué (reposo médico, avisó, vacaciones, feriado...), y entonces es un día JUSTIFICADO, pagado o no según lo que
 * el dueño haya marcado. Los días de descanso de la persona no cuentan para nada.
 */

import { claveSumarDias } from "./calendario";

// ---------------------------------------------------------------------------
//  Días de trabajo de cada persona
// ---------------------------------------------------------------------------

/** Los días de la semana en el orden en que se ven (lunes primero). `valor`: 0 = domingo … 6 = sábado. */
export const DIAS_SEMANA = [
  { valor: 1, corto: "Lun", largo: "Lunes" },
  { valor: 2, corto: "Mar", largo: "Martes" },
  { valor: 3, corto: "Mié", largo: "Miércoles" },
  { valor: 4, corto: "Jue", largo: "Jueves" },
  { valor: 5, corto: "Vie", largo: "Viernes" },
  { valor: 6, corto: "Sáb", largo: "Sábado" },
  { valor: 0, corto: "Dom", largo: "Domingo" },
] as const;

/** De lunes a sábado: lo que tiene cada persona hasta que el dueño lo cambie. */
export const DIAS_TRABAJO_PREDETERMINADOS: number[] = [1, 2, 3, 4, 5, 6];

/** Los días elegidos, sin repetir y en el orden de la semana (lunes primero); NULL si no hay ninguno válido. */
export function diasTrabajoValidos(valor: unknown): number[] | null {
  if (!Array.isArray(valor)) return null;
  const numeros = valor.map((v) => (typeof v === "number" ? v : Number(v)));
  if (numeros.some((n) => !Number.isInteger(n) || n < 0 || n > 6)) return null;
  const unicos = new Set(numeros);
  const ordenados = DIAS_SEMANA.map((d) => d.valor as number).filter((d) => unicos.has(d));
  return ordenados.length > 0 ? ordenados : null;
}

/** Los días de trabajo guardados, o los de siempre (lunes a sábado) si vienen vacíos o raros. */
export function normalizarDiasTrabajo(valor: unknown): number[] {
  return diasTrabajoValidos(valor) ?? [...DIAS_TRABAJO_PREDETERMINADOS];
}

/** "Lun a Sáb", "Lun, Mié y Vie", "Todos los días": los días de trabajo en poco lugar. */
export function resumenDeDiasTrabajo(dias: number[]): string {
  const validos = diasTrabajoValidos(dias) ?? [];
  if (validos.length === 0) return "Sin días";
  if (validos.length === 7) return "Todos los días";
  const orden = DIAS_SEMANA.map((d) => d.valor as number);
  const nombre = (n: number) => DIAS_SEMANA.find((d) => d.valor === n)!.corto;
  const fichas: string[] = [];
  let i = 0;
  while (i < orden.length) {
    if (!validos.includes(orden[i])) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < orden.length && validos.includes(orden[j + 1])) j++;
    const largo = j - i + 1;
    if (largo >= 3) fichas.push(`${nombre(orden[i])} a ${nombre(orden[j])}`);
    else for (let k = i; k <= j; k++) fichas.push(nombre(orden[k]));
    i = j + 1;
  }
  if (fichas.length === 1) return fichas[0];
  return `${fichas.slice(0, -1).join(", ")} y ${fichas[fichas.length - 1]}`;
}

// ---------------------------------------------------------------------------
//  Fechas ("YYYY-MM-DD", sin horas ni zonas)
// ---------------------------------------------------------------------------

/** ¿Es un día real ("2026-02-30" no lo es)? */
export function esDiaValido(clave: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(clave) && claveSumarDias(clave, 0) === clave;
}

/** Día de la semana de una clave: 0 = domingo … 6 = sábado. */
export function diaSemanaDeClave(clave: string): number {
  const [y, m, d] = clave.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Todos los días entre dos claves, extremos incluidos (vacío si `desde` es posterior a `hasta`). */
export function diasEntre(desde: string, hasta: string, maximo = 400): string[] {
  const dias: string[] = [];
  let cursor = desde;
  while (cursor <= hasta && dias.length < maximo) {
    dias.push(cursor);
    cursor = claveSumarDias(cursor, 1);
  }
  return dias;
}

/** Cuántos días tiene el mes de una clave (28 a 31). */
function diasDelMes(clave: string): number {
  const [y, m] = clave.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

// ---------------------------------------------------------------------------
//  Tipos de ausencia
// ---------------------------------------------------------------------------

export type TipoAusencia = "reposo" | "aviso" | "permiso" | "vacaciones" | "feriado" | "falta";
export type ColorAusencia = "azul" | "aviso" | "marca" | "violeta" | "neutro" | "peligro";

/**
 * Los tipos de ausencia. Ningún tipo trae «se paga» de antemano, A PROPÓSITO: si ese día se le paga lo decide el administrador, registro
 * por registro, tildando la casilla (un reposo, un permiso o unas vacaciones tampoco se pagan solos). Así la decisión es suya y queda en la
 * Bitácora con su nombre; el sistema nunca marca por su cuenta.
 */
export const TIPOS_AUSENCIA: {
  valor: TipoAusencia;
  etiqueta: string;
  color: ColorAusencia;
  detalle: string;
}[] = [
  { valor: "reposo", etiqueta: "Reposo médico", color: "azul", detalle: "Presentó certificado o avisó que estaba enfermo." },
  { valor: "aviso", etiqueta: "Avisó que no viene", color: "aviso", detalle: "Avisó antes que ese día no iba a venir." },
  { valor: "permiso", etiqueta: "Permiso autorizado", color: "marca", detalle: "Se le dio permiso con anticipación." },
  { valor: "vacaciones", etiqueta: "Vacaciones", color: "violeta", detalle: "Días de vacaciones." },
  { valor: "feriado", etiqueta: "Feriado o día libre", color: "neutro", detalle: "El negocio no abrió o dio el día libre." },
  { valor: "falta", etiqueta: "Falta sin aviso", color: "peligro", detalle: "No vino ni avisó (sirve para dejar un comentario)." },
];

/**
 * El aviso que lleva la Liquidación (pantalla, PDF y Excel) para que nadie la tome por una liquidación legal ni por algo que el sistema
 * paga o descuenta: es una referencia, cada empresa puede calcular distinto y el administrador es quien autoriza cada día que se paga.
 */
export const AVISO_REFERENCIA_LIQUIDACION = {
  titulo: "Referencia de cálculo",
  texto:
    "Esta liquidación es una guía que arma TuMenuSmart con las marcaciones y con las ausencias que el administrador autorizó. No es una " +
    "liquidación legal ni un recibo de salario, y no paga ni descuenta nada de la caja. Cada empresa puede calcular distinto (otro divisor " +
    "del día, descuentos, IPS, aguinaldo, vacaciones, horas extra): confirmá el importe con tu contador antes de pagar.",
};

export function esTipoAusencia(valor: string): valor is TipoAusencia {
  return TIPOS_AUSENCIA.some((t) => t.valor === valor);
}

export function datosDeTipo(tipo: string) {
  return TIPOS_AUSENCIA.find((t) => t.valor === tipo) ?? null;
}

export function etiquetaDeAusencia(tipo: string): string {
  return datosDeTipo(tipo)?.etiqueta ?? tipo;
}

/** Un registro de ausencia tal como lo usan las cuentas (un rango de días de una persona). */
export type AusenciaRango = {
  id: string;
  colaboradorId: string;
  desde: string;
  hasta: string;
  tipo: string;
  pagado: boolean;
  nota: string | null;
};

// ---------------------------------------------------------------------------
//  Qué pasó cada día
// ---------------------------------------------------------------------------

export type EstadoDia =
  /** Tenía que ir y marcó. */
  | "trabajo"
  /** Marcó en un día que no era de trabajo suyo (un día extra). */
  | "extra"
  /** Tenía que ir y no marcó, pero el dueño anotó por qué (ver `pagado`). */
  | "justificado"
  /** Tenía que ir, ya pasó el día y no marcó ni se anotó nada. */
  | "falta"
  /** Es hoy y todavía no marcó ni se anotó nada: puede que aún llegue. */
  | "pendiente"
  /** Todavía no llegó el día. */
  | "futuro"
  /** No era su día de trabajo. */
  | "descanso"
  /** Un día en que el sistema todavía no la controlaba (antes del alta o después de darla de baja). */
  | "sin_control";

export type DiaClasificado = {
  dia: string;
  estado: EstadoDia;
  /** El registro que cubre ese día, si lo hay. */
  ausencia: AusenciaRango | null;
  /** Solo en un día justificado: ¿se paga? */
  pagado: boolean;
};

/**
 * Qué fue cada día de una persona entre `desde` y `hasta`. Orden de prioridad: si marcó, trabajó (aunque fuera su descanso, y
 * aunque tuviera una ausencia anotada); si no marcó y no era su día, es descanso; si era su día y hay una ausencia anotada,
 * está justificado; si no, depende de cuándo fue (antes de que la controláramos, hoy, futuro, o ya pasó = falta).
 */
export function clasificarDias(args: {
  desde: string;
  hasta: string;
  hoy: string;
  diasTrabajo: number[];
  /** El primer día que se controla a la persona (el día en que se la dio de alta). */
  controlDesde: string;
  /** El último día que se la controla; NULL = sigue activa. */
  controlHasta?: string | null;
  diasConMarcacion: Set<string>;
  ausencias: AusenciaRango[];
}): DiaClasificado[] {
  const { desde, hasta, hoy, controlDesde, diasConMarcacion, ausencias } = args;
  const controlHasta = args.controlHasta ?? null;
  const laborables = new Set(normalizarDiasTrabajo(args.diasTrabajo));

  return diasEntre(desde, hasta).map((dia) => {
    const laborable = laborables.has(diaSemanaDeClave(dia));
    const ausencia = ausencias.find((a) => a.desde <= dia && dia <= a.hasta) ?? null;
    const base = { dia, ausencia, pagado: false };

    if (diasConMarcacion.has(dia)) return { ...base, estado: laborable ? "trabajo" : "extra" } as DiaClasificado;
    if (!laborable) return { ...base, estado: "descanso" } as DiaClasificado;
    if (ausencia) return { ...base, estado: "justificado", pagado: ausencia.pagado } as DiaClasificado;
    if (dia < controlDesde || (controlHasta !== null && dia > controlHasta)) {
      return { ...base, estado: "sin_control" } as DiaClasificado;
    }
    if (dia > hoy) return { ...base, estado: "futuro" } as DiaClasificado;
    if (dia === hoy) return { ...base, estado: "pendiente" } as DiaClasificado;
    return { ...base, estado: "falta" } as DiaClasificado;
  });
}

export type ResumenDias = {
  /** Los días que tenía que ir y que se controlan (trabajó, justificados, faltas, hoy y los que vienen). */
  esperados: number;
  /** Los días en que marcó (incluye los extra). */
  trabajados: number;
  /** De esos, los que fueron en su día de descanso. */
  extra: number;
  justificadosPagados: number;
  justificadosSinGoce: number;
  faltas: number;
  /** Hoy, sin marcar todavía. */
  pendientes: number;
  /** Días que vienen, sin marcar ni justificar. */
  futuros: number;
};

export function resumirDias(dias: DiaClasificado[]): ResumenDias {
  const r: ResumenDias = {
    esperados: 0,
    trabajados: 0,
    extra: 0,
    justificadosPagados: 0,
    justificadosSinGoce: 0,
    faltas: 0,
    pendientes: 0,
    futuros: 0,
  };
  for (const d of dias) {
    switch (d.estado) {
      case "trabajo":
        r.esperados++;
        r.trabajados++;
        break;
      case "extra":
        r.trabajados++;
        r.extra++;
        break;
      case "justificado":
        r.esperados++;
        if (d.pagado) r.justificadosPagados++;
        else r.justificadosSinGoce++;
        break;
      case "falta":
        r.esperados++;
        r.faltas++;
        break;
      case "pendiente":
        r.esperados++;
        r.pendientes++;
        break;
      case "futuro":
        r.esperados++;
        r.futuros++;
        break;
    }
  }
  return r;
}

// ---------------------------------------------------------------------------
//  Cómo se paga y la liquidación
// ---------------------------------------------------------------------------

export type FormaDePago = "mensual" | "jornal";

export const FORMAS_DE_PAGO: { valor: FormaDePago; etiqueta: string; detalle: string }[] = [
  { valor: "mensual", etiqueta: "Mensual", detalle: "Un salario por mes. Cada falta descuenta un día (el salario ÷ 30)." },
  { valor: "jornal", etiqueta: "Jornal", detalle: "Un monto por cada día que fue (y por los días justificados que se le pagan)." },
];

export function esFormaDePago(valor: unknown): valor is FormaDePago {
  return valor === "mensual" || valor === "jornal";
}

export function etiquetaDeFormaDePago(forma: string | null | undefined): string {
  return FORMAS_DE_PAGO.find((f) => f.valor === forma)?.etiqueta ?? "Sin definir";
}

/** El mes comercial que se usa para el valor de un día: salario ÷ 30. */
export const DIAS_DEL_MES_COMERCIAL = 30;

/** Lo que vale un día de un salario mensual (en guaraníes enteros). */
export function valorDelDia(montoMensual: number): number {
  return Math.round(montoMensual / DIAS_DEL_MES_COMERCIAL);
}

/**
 * El salario que corresponde a un período: mes completo = el salario entero; un tramo de un mes = los días corridos ÷ 30 (nunca más
 * que el salario). Si el período abarca varios meses se suma cada tramo.
 */
export function sueldoDelPeriodo(montoMensual: number, desde: string, hasta: string): number {
  if (montoMensual <= 0 || desde > hasta) return 0;
  let total = 0;
  let cursor = desde;
  while (cursor <= hasta) {
    const n = diasDelMes(cursor);
    const finDeMes = `${cursor.slice(0, 8)}${String(n).padStart(2, "0")}`;
    const finTramo = hasta < finDeMes ? hasta : finDeMes;
    const dias = diasEntre(cursor, finTramo, 40).length;
    const fraccion = dias >= n ? 1 : Math.min(dias, DIAS_DEL_MES_COMERCIAL) / DIAS_DEL_MES_COMERCIAL;
    total += montoMensual * fraccion;
    cursor = claveSumarDias(finDeMes, 1);
  }
  return Math.round(total);
}

export type Liquidacion = {
  /** Lo que le corresponde antes de descuentos. */
  bruto: number;
  /** Lo que se le descuenta por faltas y días sin goce (solo mensual). */
  descuento: number;
  /** Lo que se le paga. */
  neto: number;
  /** El valor de un día: salario ÷ 30 (mensual) o el monto del jornal. */
  valorDia: number;
  /** Cuántos días se descontaron (mensual) o se pagaron (jornal). */
  diasLiquidados: number;
};

const SIN_LIQUIDAR: Liquidacion = { bruto: 0, descuento: 0, neto: 0, valorDia: 0, diasLiquidados: 0 };

/**
 * Lo que se le debe a una persona por un período.
 *  - Mensual: el salario del período menos un día (salario ÷ 30) por cada falta sin aviso y cada día justificado SIN goce.
 *  - Jornal: un jornal por cada día que marcó y por cada día justificado que se le paga.
 * Los días de hoy sin marcar y los que vienen no descuentan ni suman (todavía no pasaron), salvo un día futuro ya justificado
 * sin goce (unas vacaciones sin pago anotadas de antemano), que sí descuenta.
 */
export function liquidar(args: {
  forma: FormaDePago | null;
  monto: number;
  desde: string;
  hasta: string;
  resumen: ResumenDias;
}): Liquidacion {
  const { forma, monto, desde, hasta, resumen } = args;
  if (!forma || monto <= 0) return { ...SIN_LIQUIDAR };

  if (forma === "jornal") {
    const dias = resumen.trabajados + resumen.justificadosPagados;
    const bruto = dias * monto;
    return { bruto, descuento: 0, neto: bruto, valorDia: monto, diasLiquidados: dias };
  }

  const bruto = sueldoDelPeriodo(monto, desde, hasta);
  const valorDia = valorDelDia(monto);
  const dias = resumen.faltas + resumen.justificadosSinGoce;
  const descuento = Math.min(bruto, dias * valorDia);
  return { bruto, descuento, neto: bruto - descuento, valorDia, diasLiquidados: dias };
}

/** El último día del mes de una clave ("2026-10-15" → "2026-10-31"). */
export function finDeMes(clave: string): string {
  const [y, m] = clave.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}
