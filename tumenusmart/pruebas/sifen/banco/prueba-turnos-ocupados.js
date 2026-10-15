// Prueba de las horas OCUPADAS de la Reserva de turnos (src/lib/disponibilidad.ts): lo que ya tomó otro cliente no desaparece de la página
// pública, se ve tachado. Las horas ocupadas son las que serían libres si nadie hubiera reservado; las libres no cambian.
(async () => {
  const { ok, igual } = window;
  const C = window.Cargador;
  const d = await C.cargar("src/lib/disponibilidad");

  const dia = (diaSemana, extra = {}) => ({ diaSemana, trabaja: true, inicio: "09:00", fin: "18:00", descansa: true, descansoInicio: "13:00", descansoFin: "14:00", ...extra });
  const semana = [0, 1, 2, 3, 4, 5, 6].map((n) => dia(n, n === 0 ? { trabaja: false } : {}));
  const lunes = dia(1);
  const m = (hhmm) => { const [h, mi] = hhmm.split(":").map(Number); return h * 60 + mi; };

  window.log("== Turnos: horas ocupadas de un día");
  // Un servicio de 30 min, sin búfer, con un turno ya tomado de 10:00 a 10:30.
  const base = { horario: lunes, ocupados: [{ desde: m("10:00"), hasta: m("10:30") }], duracion: 30, buffer: 0, minutoMinimo: 0 };
  const libres = d.horasLibres(base);
  const ocupadas = d.horasOcupadas(base);
  igual(ocupadas, [m("09:45"), m("10:00"), m("10:15")], "las que pisan el turno de 10:00 a 10:30: 09:45, 10:00 y 10:15");
  ok(!libres.includes(m("10:00")) && libres.includes(m("09:30")) && libres.includes(m("10:30")), "las libres no incluyen las ocupadas y sí las de alrededor");
  ok(ocupadas.every((x) => !libres.includes(x)), "ninguna hora está a la vez libre y ocupada");
  igual([...libres, ...ocupadas].sort((a, b) => a - b), d.horasLibres({ ...base, ocupados: [] }), "libres + ocupadas = todas las horas del horario (nada se pierde)");

  // Sin turnos tomados: nada ocupado.
  igual(d.horasOcupadas({ ...base, ocupados: [] }), [], "sin turnos tomados no hay horas ocupadas");

  // Un servicio de una hora con búfer: el turno tomado ya trae su búfer en `hasta` (11:00 a 12:00 más 15 de limpieza = 12:15).
  const largo = { horario: lunes, ocupados: [{ desde: m("11:00"), hasta: m("12:15") }], duracion: 60, buffer: 15, minutoMinimo: 0 };
  const ocupLargo = d.horasOcupadas(largo);
  ok(ocupLargo[0] === m("10:00") && ocupLargo.includes(m("12:00")) && !ocupLargo.includes(m("09:45")) && !ocupLargo.includes(m("12:15")), "con un servicio de una hora y búfer: ocupadas de 10:00 a 12:00 (las que lo pisan)");
  ok(d.horasLibres(largo).includes(m("09:00")) && d.horasLibres(largo).includes(m("14:00")), "y siguen libres la primera hora del día y las de la tarde (12:15 ya no entra antes del descanso)");

  // El descanso y el cierre no son «ocupado»: ahí no hay horario, simplemente no existen.
  const todas = d.horasLibres({ ...base, ocupados: [] });
  ok(!todas.includes(m("13:00")) && !todas.includes(m("13:45")) && !todas.includes(m("17:45")), "el descanso y lo que no entra antes del cierre no son horas del día");
  ok(!ocupadas.includes(m("13:00")) && !ocupadas.includes(m("17:45")), "y tampoco aparecen como ocupadas");

  // Hoy: lo que ya pasó no se muestra ni libre ni ocupado.
  const hoyAhora = { ...base, ocupados: [{ desde: m("10:00"), hasta: m("10:30") }], minutoMinimo: m("10:15") };
  igual(d.horasOcupadas(hoyAhora), [m("10:15")], "hoy, con 10:15 como primera hora posible, solo queda 10:15 ocupada (09:45 y 10:00 ya pasaron)");

  // Día cerrado.
  igual(d.horasOcupadas({ ...base, horario: dia(0, { trabaja: false }) }), [], "un día que no se atiende no tiene horas ocupadas");
  igual(d.horasOcupadas({ ...base, horario: undefined }), [], "sin horario tampoco");

  window.log("== Turnos: horas ocupadas de los próximos días");
  const hoy = "2026-10-14"; // miércoles
  const ocupadosPorDia = new Map([
    ["2026-10-14", [{ desde: m("15:00"), hasta: m("15:30") }]],
    ["2026-10-16", [{ desde: m("09:00"), hasta: m("18:00") }]], // viernes: todo el día tomado
  ]);
  const periodo = { horarios: semana, ocupadosPorDia, duracion: 30, buffer: 0, hoy, minutosAhora: m("12:00") };
  const libresPeriodo = d.horasDelPeriodo(periodo);
  const ocupadasPeriodo = d.horasOcupadasDelPeriodo(periodo);
  ok(Object.keys(ocupadasPeriodo).sort().join() === "2026-10-14,2026-10-16", "solo figuran los días con turnos tomados (hoy y el viernes)");
  ok(ocupadasPeriodo["2026-10-14"].join() === [m("14:45"), m("15:00"), m("15:15")].join(), "hoy: 14:45, 15:00 y 15:15");
  ok(!libresPeriodo["2026-10-16"], "el viernes, tomado entero, no tiene horas libres…");
  ok(ocupadasPeriodo["2026-10-16"].length > 20, "…pero sí sus horas ocupadas: el día no desaparece (" + ocupadasPeriodo["2026-10-16"].length + ")");
  ok(libresPeriodo["2026-10-15"] && libresPeriodo["2026-10-15"][0] === m("09:00"), "los demás días siguen igual: el jueves arranca libre a las 09:00");
  ok(!libresPeriodo["2026-10-18"] && !ocupadasPeriodo["2026-10-18"], "el domingo (no se atiende) no aparece ni libre ni ocupado");

  // Propiedad: con turnos tomados al azar, libres y ocupadas nunca se pisan y juntas son todas las horas del horario.
  let semilla = 7;
  const azar = () => { semilla = (semilla * 1103515245 + 12345) & 0x7fffffff; return semilla / 0x7fffffff; };
  let fallas = 0;
  for (let i = 0; i < 400; i++) {
    const oc = [];
    for (let k = 0; k < Math.floor(azar() * 5); k++) {
      const desde = 540 + Math.floor(azar() * 36) * 15;
      oc.push({ desde, hasta: desde + 15 * (1 + Math.floor(azar() * 6)) });
    }
    const datos = { horario: lunes, ocupados: oc, duracion: [15, 30, 45, 60, 90][Math.floor(azar() * 5)], buffer: [0, 0, 10, 15][Math.floor(azar() * 4)], minutoMinimo: Math.floor(azar() * 3) * 120 };
    const l = d.horasLibres(datos);
    const o = d.horasOcupadas(datos);
    const todasLasHoras = d.horasLibres({ ...datos, ocupados: [] });
    const disjuntas = o.every((x) => !l.includes(x));
    const completas = [...l, ...o].sort((a, b) => a - b).join() === todasLasHoras.join();
    if (!disjuntas || !completas) fallas++;
  }
  ok(fallas === 0, "400 combinaciones al azar: libres y ocupadas nunca se pisan y suman todas las horas (" + fallas + " fallas)");

  window.log("\naciertos: " + window.__aciertos + " · fallas: " + window.__fallas);
  window.__listo = true;
})().catch((e) => { document.getElementById("salida").textContent += "\nERROR: " + (e && e.stack || e); window.__listo = true; window.__fallas = (window.__fallas || 0) + 1; });
