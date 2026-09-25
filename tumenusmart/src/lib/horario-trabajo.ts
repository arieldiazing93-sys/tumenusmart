/**
 * El horario general de trabajo de la Reserva de turnos: qué días se atiende,
 * de qué hora a qué hora y el descanso del medio.
 *
 * Puro (sin Prisma) para usarlo igual desde el editor del navegador, desde la
 * acción que guarda y desde el calendario: lo que el editor marca como error,
 * lo que el servidor rechaza y lo que el calendario sombrea salen todos de acá.
 */

/** Un día del horario. `diaSemana`: 0 = domingo, 1 = lunes … 6 = sábado. */
export type HorarioDia = {
  diaSemana: number;
  trabaja: boolean;
  /** "HH:MM" */
  inicio: string;
  fin: string;
  descansa: boolean;
  descansoInicio: string;
  descansoFin: string;
};

/** La semana como la lee la gente: lunes primero, domingo al final. */
export const DIAS_HORARIO = [
  { diaSemana: 1, nombre: "Lunes" },
  { diaSemana: 2, nombre: "Martes" },
  { diaSemana: 3, nombre: "Miércoles" },
  { diaSemana: 4, nombre: "Jueves" },
  { diaSemana: 5, nombre: "Viernes" },
  { diaSemana: 6, nombre: "Sábado" },
  { diaSemana: 0, nombre: "Domingo" },
] as const;

export function nombreDeDia(diaSemana: number): string {
  return DIAS_HORARIO.find((d) => d.diaSemana === diaSemana)?.nombre ?? "";
}

/** Lo que se muestra mientras nadie configuró nada: lunes a sábado de 9 a 18 con descanso de 13 a 14, y domingo cerrado. */
export function horarioPorDefecto(): HorarioDia[] {
  return DIAS_HORARIO.map((d) => ({
    diaSemana: d.diaSemana,
    trabaja: d.diaSemana !== 0,
    inicio: "09:00",
    fin: "18:00",
    descansa: d.diaSemana !== 0,
    descansoInicio: "13:00",
    descansoFin: "14:00",
  }));
}

/** Los siete días en orden de semana; los que falten se completan con el horario por defecto. */
export function completarHorario(filas: HorarioDia[]): HorarioDia[] {
  const porDefecto = horarioPorDefecto();
  return porDefecto.map((base) => filas.find((f) => f.diaSemana === base.diaSemana) ?? base);
}

const FORMATO_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/** "09:30" sí; "9:30", "24:00" y "09:60" no. */
export function esHoraValida(valor: unknown): valor is string {
  return typeof valor === "string" && FORMATO_HORA.test(valor);
}

/** "13:30" → 810. */
export function aMinutos(hora: string): number {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Lo que está mal en un día, o null si está bien. Un día apagado no se revisa:
 * sus horas no se usan.
 */
export function errorDeDia(d: HorarioDia): string | null {
  if (!d.trabaja) return null;
  const nombre = nombreDeDia(d.diaSemana);
  if (![d.inicio, d.fin].every(esHoraValida)) return `${nombre}: completá la hora de inicio y la de fin.`;
  if (aMinutos(d.fin) <= aMinutos(d.inicio)) {
    return `${nombre}: la hora de fin tiene que ser después de la de inicio.`;
  }
  if (!d.descansa) return null;
  if (![d.descansoInicio, d.descansoFin].every(esHoraValida)) {
    return `${nombre}: completá la hora de inicio y la de fin del descanso.`;
  }
  if (aMinutos(d.descansoFin) <= aMinutos(d.descansoInicio)) {
    return `${nombre}: el descanso tiene que terminar después de empezar.`;
  }
  if (aMinutos(d.descansoInicio) < aMinutos(d.inicio) || aMinutos(d.descansoFin) > aMinutos(d.fin)) {
    return `${nombre}: el descanso tiene que quedar dentro del horario de trabajo.`;
  }
  return null;
}

/** El primer error de la semana, o null si está todo bien. */
export function validarHorario(dias: HorarioDia[]): string | null {
  for (const d of dias) {
    const error = errorDeDia(d);
    if (error) return error;
  }
  return null;
}

// ---------------------------------------------------------------------------
//  Para el calendario
// ---------------------------------------------------------------------------

/**
 * Desde qué hora y hasta cuál se trabaja en la semana (en minutos, a horas
 * enteras), para que el calendario dibuje exactamente ese tramo. null si no se
 * trabaja ningún día.
 */
export function rangoDelHorario(horarios: HorarioDia[]): { inicio: number; fin: number } | null {
  const abiertos = horarios.filter((h) => h.trabaja && esHoraValida(h.inicio) && esHoraValida(h.fin));
  if (abiertos.length === 0) return null;
  return {
    inicio: Math.floor(Math.min(...abiertos.map((h) => aMinutos(h.inicio))) / 60) * 60,
    fin: Math.ceil(Math.max(...abiertos.map((h) => aMinutos(h.fin))) / 60) * 60,
  };
}

/** Un tramo del día que el calendario sombrea: fuera del horario ("cerrado") o el descanso. */
export type Franja = { desde: number; hasta: number; tipo: "cerrado" | "descanso" };

/**
 * Los tramos sombreados de un día dentro de lo que dibuja el calendario
 * (`rango`, en minutos). Sin horario configurado para ese día no hay nada que
 * sombrear.
 */
export function franjasDelDia(h: HorarioDia | undefined, rango: { inicio: number; fin: number }): Franja[] {
  if (!h) return [];
  if (!h.trabaja) return [{ desde: rango.inicio, hasta: rango.fin, tipo: "cerrado" }];

  const franjas: Franja[] = [];
  const inicio = aMinutos(h.inicio);
  const fin = aMinutos(h.fin);
  if (inicio > rango.inicio) franjas.push({ desde: rango.inicio, hasta: Math.min(inicio, rango.fin), tipo: "cerrado" });
  if (fin < rango.fin) franjas.push({ desde: Math.max(fin, rango.inicio), hasta: rango.fin, tipo: "cerrado" });
  if (h.descansa) {
    const desde = Math.max(aMinutos(h.descansoInicio), rango.inicio);
    const hasta = Math.min(aMinutos(h.descansoFin), rango.fin);
    if (hasta > desde) franjas.push({ desde, hasta, tipo: "descanso" });
  }
  return franjas;
}

// ---------------------------------------------------------------------------
//  Horario propio de cada persona
// ---------------------------------------------------------------------------

/**
 * El horario que de verdad rige para una persona: el suyo propio si lo tiene guardado (siete filas) y, si no,
 * el general del negocio. Los días que falten se completan con el horario por defecto.
 */
export function horarioEfectivo(propio: HorarioDia[], general: HorarioDia[]): HorarioDia[] {
  return completarHorario(propio.length > 0 ? propio : general);
}

/**
 * Los tramos sombreados de un día cuando en el calendario se ve a VARIAS personas a la vez (cada una con su
 * horario): queda libre todo lo que alguien atiende, y se sombrea lo que nadie atiende —"cerrado" antes de que
 * abra el primero y después de que cierre el último, "descanso" en los huecos del medio—. Con una sola persona
 * da lo mismo que `franjasDelDia`. Sin ningún horario no hay nada que sombrear.
 */
export function franjasDelDiaDeVarios(dias: (HorarioDia | undefined)[], rango: { inicio: number; fin: number }): Franja[] {
  const conHorario = dias.filter((h): h is HorarioDia => !!h);
  if (conHorario.length === 0) return [];
  const abiertos = conHorario.filter((h) => h.trabaja);
  if (abiertos.length === 0) return [{ desde: rango.inicio, hasta: rango.fin, tipo: "cerrado" }];

  // Los tramos en que trabaja alguien: el horario de cada uno menos su descanso, juntados en uno solo.
  const tramos: [number, number][] = [];
  for (const h of abiertos) {
    const inicio = aMinutos(h.inicio);
    const fin = aMinutos(h.fin);
    if (h.descansa) {
      const descansoDesde = aMinutos(h.descansoInicio);
      const descansoHasta = aMinutos(h.descansoFin);
      if (descansoDesde > inicio) tramos.push([inicio, Math.min(descansoDesde, fin)]);
      if (descansoHasta < fin) tramos.push([Math.max(descansoHasta, inicio), fin]);
    } else {
      tramos.push([inicio, fin]);
    }
  }
  tramos.sort((a, b) => a[0] - b[0]);
  const unidos: [number, number][] = [];
  for (const t of tramos) {
    const ultimo = unidos[unidos.length - 1];
    if (ultimo && t[0] <= ultimo[1]) ultimo[1] = Math.max(ultimo[1], t[1]);
    else unidos.push([t[0], t[1]]);
  }

  const abre = Math.min(...abiertos.map((h) => aMinutos(h.inicio)));
  const cierra = Math.max(...abiertos.map((h) => aMinutos(h.fin)));

  const franjas: Franja[] = [];
  // Un hueco sin nadie, recortado a lo que dibuja el calendario y partido según esté fuera o dentro del día de trabajo.
  function agregarHueco(desde: number, hasta: number) {
    const d = Math.max(desde, rango.inicio);
    const h = Math.min(hasta, rango.fin);
    if (h <= d) return;
    const partes: [number, number, Franja["tipo"]][] = [
      [d, Math.min(h, abre), "cerrado"],
      [Math.max(d, abre), Math.min(h, cierra), "descanso"],
      [Math.max(d, cierra), h, "cerrado"],
    ];
    for (const [a, b, tipo] of partes) if (b > a) franjas.push({ desde: a, hasta: b, tipo });
  }

  let cursor = rango.inicio;
  for (const [desde, hasta] of unidos) {
    agregarHueco(cursor, desde);
    cursor = Math.max(cursor, hasta);
  }
  agregarHueco(cursor, rango.fin);
  return franjas;
}

/** "Lun", "Mar"… para armar el resumen de una semana. */
const ABREVIATURAS_DIA: Record<number, string> = { 1: "Lun", 2: "Mar", 3: "Mié", 4: "Jue", 5: "Vie", 6: "Sáb", 0: "Dom" };

/** Las horas de un día en palabras: "09:00 a 18:00 · descanso 13:00 a 14:00", o "No trabaja". */
export function textoDeHoras(h: HorarioDia): string {
  if (!h.trabaja) return "No trabaja";
  const base = `${h.inicio} a ${h.fin}`;
  return h.descansa ? `${base} · descanso ${h.descansoInicio} a ${h.descansoFin}` : base;
}

/**
 * Una semana resumida, juntando los días seguidos que tienen las mismas horas:
 * `[{ dias: "Lun a Vie", horas: "09:00 a 18:00 · descanso 13:00 a 14:00" }, { dias: "Sáb", horas: "09:00 a 13:00" }, …]`.
 */
export function resumenDeHorario(dias: HorarioDia[]): { dias: string; horas: string }[] {
  const ordenados = DIAS_HORARIO.map((d) => dias.find((x) => x.diaSemana === d.diaSemana)).filter(
    (h): h is HorarioDia => !!h
  );
  const grupos: { desde: number; hasta: number; horas: string }[] = [];
  ordenados.forEach((h, i) => {
    const horas = textoDeHoras(h);
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.horas === horas && ultimo.hasta === i - 1) ultimo.hasta = i;
    else grupos.push({ desde: i, hasta: i, horas });
  });
  const abreviatura = (i: number) => ABREVIATURAS_DIA[ordenados[i].diaSemana];
  return grupos.map((g) => ({
    dias:
      g.desde === g.hasta
        ? abreviatura(g.desde)
        : g.hasta === g.desde + 1
          ? `${abreviatura(g.desde)} y ${abreviatura(g.hasta)}`
          : `${abreviatura(g.desde)} a ${abreviatura(g.hasta)}`,
    horas: g.horas,
  }));
}

/**
 * El horario del negocio visto desde afuera (la página pública de reservas): de qué hora a qué hora hay alguien
 * atendiendo cada día, sumando lo que trabaja cada persona (con su horario propio o, si no lo tiene, con el general).
 * Un día en que nadie trabaja figura cerrado. Si todavía nadie tiene un horario propio es simplemente el general.
 * Null si no se guardó ningún horario.
 */
export function horarioDelNegocio(
  generales: HorarioDia[],
  propios: Map<string, HorarioDia[]>,
  personalIds: string[]
): HorarioDia[] | null {
  const hayPropios = personalIds.some((id) => (propios.get(id) ?? []).length > 0);
  if (generales.length === 0 && !hayPropios) return null;
  const general = completarHorario(generales);
  if (!hayPropios) return general;

  const semanas = personalIds.map((id) => horarioEfectivo(propios.get(id) ?? [], generales));
  return DIAS_HORARIO.map(({ diaSemana }): HorarioDia => {
    const trabajan = semanas
      .map((semana) => semana.find((h) => h.diaSemana === diaSemana))
      .filter((h): h is HorarioDia => !!h && h.trabaja);
    const base = general.find((h) => h.diaSemana === diaSemana) as HorarioDia;
    if (trabajan.length === 0) return { ...base, trabaja: false, descansa: false };
    const abre = Math.min(...trabajan.map((h) => aMinutos(h.inicio)));
    const cierra = Math.max(...trabajan.map((h) => aMinutos(h.fin)));
    const hora = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    return { ...base, trabaja: true, inicio: hora(abre), fin: hora(cierra), descansa: false };
  });
}
