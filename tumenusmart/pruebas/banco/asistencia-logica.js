// Las reglas de asistencia y de liquidación del personal (src/lib/asistencia.ts y src/lib/ausencias.ts) con las funciones REALES: lo que se
// le paga o descuenta a cada persona tiene que cerrar al guaraní y no depender del orden ni del azar. Miles de casos al azar.
(async () => {
  const C = window.Cargador; const { ok } = window;
  const A = await C.cargar("src/lib/asistencia");
  const U = await C.cargar("src/lib/ausencias");
  const azar = (n) => Math.floor(Math.random() * n);
  const hhmm = (min) => String(Math.floor(min / 60)).padStart(2, "0") + ":" + String(min % 60).padStart(2, "0");
  const min = (h) => { const [a, b] = h.split(":").map(Number); return a * 60 + b; };

  // ============================================================================================== tardanza
  window.log("== Tardanza");
  ok(A.calcularTardanza("08:00", 10, "08:05") === 0, "dentro de la tolerancia es 0");
  ok(A.calcularTardanza("08:00", 10, "08:12") === 12, "pasada la tolerancia cuenta TODO el atraso (12 minutos)");
  ok(A.calcularTardanza("08:00", 10, "07:50") === 0, "llegar antes no es tarde");
  ok(A.calcularTardanza("22:00", 10, "00:05") === 125, "turno noche: entra 22:00 y marca 00:05 → 125 minutos tarde (antes figuraba «a tiempo»)");
  ok(A.calcularTardanza("22:00", 10, "21:55") === 0, "turno noche: llegar 5 minutos antes es 0");
  ok(A.calcularTardanza("00:30", 10, "23:50") === 0, "entra a las 00:30 y marca 23:50 del día anterior: llegó 40 antes (0)");
  ok(A.calcularTardanza("00:30", 10, "00:50") === 20, "entra a las 00:30 y marca 00:50: 20 tarde");
  ok(A.calcularTardanza(null, 10, "08:12") === null && A.calcularTardanza("", 10, "08:12") === null, "sin hora de entrada no se controla");
  ok(A.calcularTardanza("8:00", 10, "08:12") === null && A.calcularTardanza("08:00", 10, "25:00") === null, "horas mal escritas no se controlan");
  let mal = 0;
  for (let i = 0; i < 4000; i++) {
    const e = azar(1440), m = azar(1440), tol = azar(30);
    let d = m - e; while (d > 720) d -= 1440; while (d <= -720) d += 1440;
    const esperado = d > tol ? d : 0;
    if (A.calcularTardanza(hhmm(e), tol, hhmm(m)) !== esperado) mal++;
  }
  ok(mal === 0, "4.000 pares de horas al azar coinciden con la diferencia más corta del reloj (" + mal + " distintas)");

  // ============================================================================================== el sueldo de un período
  window.log("== Salario de un período (mensual, ÷ 30)");
  ok(U.sueldoDelPeriodo(3000000, "2026-10-01", "2026-10-31") === 3000000, "un mes completo = el salario entero");
  ok(U.sueldoDelPeriodo(3000000, "2026-02-01", "2026-02-28") === 3000000, "febrero completo (28 días) = el salario entero");
  ok(U.sueldoDelPeriodo(3000000, "2026-10-01", "2026-10-15") === 1500000, "15 días = la mitad");
  ok(U.sueldoDelPeriodo(3000000, "2026-10-01", "2026-10-30") === 3000000, "30 días de un mes de 31 = el salario entero (mes comercial de 30)");
  ok(U.sueldoDelPeriodo(3000000, "2026-10-20", "2026-11-10") === 3000000 * 12 / 30 + 3000000 * 10 / 30, "un período a caballo entre dos meses suma cada tramo (12 días de octubre + 10 de noviembre)");
  ok(U.sueldoDelPeriodo(0, "2026-10-01", "2026-10-31") === 0 && U.sueldoDelPeriodo(1000, "2026-10-31", "2026-10-01") === 0, "monto cero o fechas al revés = 0");
  let malSueldo = 0;
  for (let i = 0; i < 1500; i++) {
    const monto = (1 + azar(900)) * 10000; const inicio = U.diasEntre("2025-01-01", "2027-12-31", 2000)[azar(1095)]; const largo = azar(120);
    const fin = U.diasEntre(inicio, "2028-06-30", 200)[largo] ?? inicio;
    const total = U.sueldoDelPeriodo(monto, inicio, fin);
    // Cortar el período justo donde cambia el mes no cambia el total (±1 por redondear cada tramo).
    const finMes = U.finDeMes(inicio);
    if (fin > finMes) { const partes = U.sueldoDelPeriodo(monto, inicio, finMes) + U.sueldoDelPeriodo(monto, U.diasEntre(finMes, finMes, 1).length ? (() => { const [y, m, d] = finMes.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10); })() : inicio, fin); if (Math.abs(partes - total) > 1) malSueldo++; }
    const meses = new Set(U.diasEntre(inicio, fin, 200).map((d) => d.slice(0, 7))).size;
    if (total < 0 || total > monto * meses + 1) malSueldo++;
  }
  ok(malSueldo === 0, "1.500 períodos al azar: nunca pasa del salario de los meses que toca y partirlo por el fin de mes no cambia el total (" + malSueldo + " con problemas)");

  // ============================================================================================== clasificar días y liquidar
  window.log("== Días, faltas y liquidación (miles de casos al azar)");
  const diaMas = (clave, n) => { const [y, m, d] = clave.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
  let casos = 0; const problemas = [];
  const falla = (m, ctx) => { if (problemas.length < 4) problemas.push(m + " " + JSON.stringify(ctx)); };
  for (let i = 0; i < 4000; i++) {
    const desde = diaMas("2026-01-01", azar(700)); const largo = 1 + azar(61); const hasta = diaMas(desde, largo - 1);
    const hoy = diaMas(desde, azar(largo + 40) - 20);
    const diasTrabajo = U.diasTrabajoValidos(Array.from({ length: 1 + azar(7) }, () => azar(7))) ?? [1, 2, 3, 4, 5, 6];
    const todos = U.diasEntre(desde, hasta);
    const marcados = new Set(todos.filter(() => Math.random() < 0.6 && true));
    // ausencias que no se pisan
    const ausencias = []; let cursor = 0;
    while (cursor < todos.length && ausencias.length < 4) { const ini = cursor + azar(8); const fin = ini + azar(5); if (ini >= todos.length) break; ausencias.push({ id: "a" + ausencias.length, colaboradorId: "c", desde: todos[ini], hasta: todos[Math.min(fin, todos.length - 1)], tipo: "reposo", pagado: Math.random() < 0.5, nota: null }); cursor = fin + 1 + azar(5); }
    const controlDesde = Math.random() < 0.3 ? diaMas(desde, azar(largo)) : "2020-01-01";
    const controlHasta = Math.random() < 0.2 ? diaMas(desde, azar(largo)) : null;
    const dias = U.clasificarDias({ desde, hasta, hoy, diasTrabajo, controlDesde, controlHasta, diasConMarcacion: marcados, ausencias });
    const r = U.resumirDias(dias); casos++;
    const ctx = { desde, hasta, hoy };
    if (dias.length !== todos.length) falla("cantidad de días", ctx);
    const cuenta = (e) => dias.filter((d) => d.estado === e).length;
    if (r.trabajados !== cuenta("trabajo") + cuenta("extra") || r.extra !== cuenta("extra")) falla("trabajados/extra", ctx);
    if (r.esperados !== cuenta("trabajo") + cuenta("justificado") + cuenta("falta") + cuenta("pendiente") + cuenta("futuro")) falla("esperados", ctx);
    if (r.faltas !== cuenta("falta") || r.pendientes !== cuenta("pendiente") || r.futuros !== cuenta("futuro")) falla("faltas/pendientes/futuros", ctx);
    if (r.justificadosPagados + r.justificadosSinGoce !== cuenta("justificado")) falla("justificados", ctx);
    for (const d of dias) {
      const laborable = diasTrabajo.includes(U.diaSemanaDeClave(d.dia));
      if (marcados.has(d.dia) && d.estado !== "trabajo" && d.estado !== "extra") falla("un día con marcación no es trabajo", { d });
      if (marcados.has(d.dia) && (d.estado === "trabajo") !== laborable) falla("trabajo/extra mal elegido", { d });
      if (!marcados.has(d.dia) && !laborable && d.estado !== "descanso") falla("un día libre sin marcar no es descanso", { d });
      if (d.estado === "falta" && (!laborable || d.dia >= hoy || marcados.has(d.dia) || d.ausencia || d.dia < controlDesde || (controlHasta && d.dia > controlHasta))) falla("falta que no debería serlo", { d, hoy, controlDesde, controlHasta });
      if (d.estado === "justificado" && (!laborable || !d.ausencia || marcados.has(d.dia))) falla("justificado mal", { d });
    }
    // liquidar
    const monto = (1 + azar(500)) * 10000;
    const mensual = U.liquidar({ forma: "mensual", monto, desde, hasta, resumen: r });
    const bruto = U.sueldoDelPeriodo(monto, desde, hasta); const valorDia = U.valorDelDia(monto);
    if (mensual.bruto !== bruto || mensual.valorDia !== valorDia) falla("bruto/valor del día mensual", ctx);
    if (mensual.descuento !== Math.min(bruto, (r.faltas + r.justificadosSinGoce) * valorDia)) falla("descuento mensual", ctx);
    if (mensual.neto !== mensual.bruto - mensual.descuento || mensual.neto < 0 || mensual.descuento < 0 || mensual.descuento > mensual.bruto) falla("neto mensual", ctx);
    const jornal = U.liquidar({ forma: "jornal", monto, desde, hasta, resumen: r });
    if (jornal.bruto !== (r.trabajados + r.justificadosPagados) * monto || jornal.neto !== jornal.bruto || jornal.descuento !== 0) falla("jornal", ctx);
    if (U.liquidar({ forma: null, monto, desde, hasta, resumen: r }).neto !== 0 || U.liquidar({ forma: "mensual", monto: 0, desde, hasta, resumen: r }).neto !== 0) falla("sin forma de pago o sin monto no liquida", ctx);
    // más faltas nunca suben el neto; más trabajo nunca lo baja
    const conFalta = { ...r, faltas: r.faltas + 1 }; const conTrabajo = { ...r, trabajados: r.trabajados + 1 };
    if (U.liquidar({ forma: "mensual", monto, desde, hasta, resumen: conFalta }).neto > mensual.neto) falla("una falta más subió el neto mensual", ctx);
    if (U.liquidar({ forma: "jornal", monto, desde, hasta, resumen: conTrabajo }).neto < jornal.neto) falla("un día más trabajado bajó el jornal", ctx);
  }
  ok(problemas.length === 0, casos + " casos al azar (días, marcaciones, ausencias, altas y bajas): todo cierra" + (problemas[0] ? " · primero: " + problemas[0] : ""));

  // Casos concretos que el dueño reconoce.
  const resumenDe = (o) => ({ esperados: 0, trabajados: 0, extra: 0, justificadosPagados: 0, justificadosSinGoce: 0, faltas: 0, pendientes: 0, futuros: 0, ...o });
  let l = U.liquidar({ forma: "mensual", monto: 3000000, desde: "2026-10-01", hasta: "2026-10-31", resumen: resumenDe({ faltas: 2 }) });
  ok(l.bruto === 3000000 && l.descuento === 200000 && l.neto === 2800000 && l.valorDia === 100000, "salario 3.000.000, 2 faltas en octubre → descuenta 200.000 (100.000 por día) y paga 2.800.000");
  l = U.liquidar({ forma: "mensual", monto: 3000000, desde: "2026-10-01", hasta: "2026-10-31", resumen: resumenDe({ justificadosPagados: 3, justificadosSinGoce: 1 }) });
  ok(l.descuento === 100000 && l.neto === 2900000, "3 días de reposo pagados no descuentan; 1 sin goce descuenta uno");
  l = U.liquidar({ forma: "jornal", monto: 120000, desde: "2026-10-01", hasta: "2026-10-31", resumen: resumenDe({ trabajados: 20, justificadosPagados: 2, faltas: 3 }) });
  ok(l.bruto === 22 * 120000 && l.neto === 2640000, "jornal de 120.000: 20 días + 2 pagados = 2.640.000, las faltas no suman");

  // ============================================================================================== días de trabajo y turnos
  window.log("== Días de trabajo y turnos");
  ok(JSON.stringify(U.diasTrabajoValidos([6, 1, 1, 3])) === "[1,3,6]", "los días se ordenan (lunes primero) y sin repetir");
  for (const raro of [[], [7], [-1], [1.5], "1,2", null, undefined, ["x"]]) ok(U.diasTrabajoValidos(raro) === null, "días inválidos (" + JSON.stringify(raro) + ") se rechazan");
  ok(U.resumenDeDiasTrabajo([1, 2, 3, 4, 5, 6]) === "Lun a Sáb" && U.resumenDeDiasTrabajo([1, 3, 5]) === "Lun, Mié y Vie" && U.resumenDeDiasTrabajo([0, 1, 2, 3, 4, 5, 6]) === "Todos los días", "el resumen de días se lee bien");
  const f = (h, mmin = 0) => new Date(Date.UTC(2026, 9, 14, h + 3, mmin)); // Asunción es UTC-3 en octubre
  const marca = (id, tipo, fecha, extra = {}) => ({ id, tipo, fecha, tardanzaMin: null, verificada: true, metodo: "pin_y_camara", ...extra });
  let t = A.armarTurnos([marca(1, "entrada", f(8)), marca(2, "salida_almuerzo", f(12)), marca(3, "vuelta_almuerzo", f(13)), marca(4, "salida", f(17))], "2026-10-14", "2026-10-14")[0];
  ok(t.estado === "completo" && t.minutosTrabajados === 480 && t.minutosAlmuerzo === 60 && t.avisos.length === 0, "08:00-17:00 con una hora de almuerzo = 8 horas trabajadas, turno completo");
  t = A.armarTurnos([marca(1, "entrada", f(8)), marca(4, "salida", f(14, 30))], "2026-10-14", "2026-10-14")[0];
  ok(t.minutosTrabajados === 390 && t.minutosAlmuerzo === null, "sin almuerzo: 08:00 a 14:30 = 6 h 30");
  let ts = A.armarTurnos([marca(1, "entrada", f(8)), marca(2, "salida", f(12)), marca(3, "entrada", f(16)), marca(4, "salida", f(20))], "2026-10-14", "2026-10-14");
  ok(ts.length === 2 && ts[0].minutosTrabajados === 240 && ts[1].minutosTrabajados === 240, "turno cortado: dos turnos de 4 horas el mismo día");
  t = A.armarTurnos([marca(1, "entrada", f(8))], "2026-10-13", "2026-10-14")[0];
  ok(t.estado === "incompleto" && t.minutosTrabajados === null && t.avisos.includes("No marcó la salida"), "una entrada de ayer sin salida queda incompleta y avisa");
  t = A.armarTurnos([marca(1, "entrada", f(8))], "2026-10-14", "2026-10-14")[0];
  ok(t.estado === "en_curso", "una entrada de hoy sin salida está en curso");
  t = A.armarTurnos([marca(1, "salida", f(17))], "2026-10-14", "2026-10-14")[0];
  ok(t.entrada === null && t.avisos.includes("No marcó la entrada"), "una salida sin entrada avisa que falta la entrada");
  const nocturno = A.armarTurnos([marca(1, "entrada", new Date(Date.UTC(2026, 9, 14, 22 + 3, 0))), marca(2, "salida", new Date(Date.UTC(2026, 9, 15, 6 + 3, 0)))], "2026-10-14", "2026-10-15")[0];
  ok(nocturno.minutosTrabajados === 480, "turno noche 22:00 a 06:00 = 8 horas (cruza la medianoche)");
  let malTurno = 0;
  for (let i = 0; i < 1500; i++) {
    const e = 360 + azar(240), almuerzo = Math.random() < 0.7, sa = e + 120 + azar(120), va = sa + 20 + azar(80), s = (almuerzo ? va : e + 60) + 60 + azar(300);
    const marcas = [marca(1, "entrada", new Date(Date.UTC(2026, 9, 14, 3, 0) + e * 60000))];
    if (almuerzo) marcas.push(marca(2, "salida_almuerzo", new Date(Date.UTC(2026, 9, 14, 3, 0) + sa * 60000)), marca(3, "vuelta_almuerzo", new Date(Date.UTC(2026, 9, 14, 3, 0) + va * 60000)));
    marcas.push(marca(4, "salida", new Date(Date.UTC(2026, 9, 14, 3, 0) + s * 60000)));
    const desordenadas = marcas.map((m) => [Math.random(), m]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
    const [tt] = A.armarTurnos(desordenadas, "2026-10-14", "2026-10-15");
    const esperado = (s - e) - (almuerzo ? va - sa : 0);
    if (tt.minutosTrabajados !== esperado || tt.estado !== "completo") malTurno++;
  }
  ok(malTurno === 0, "1.500 turnos al azar, con las marcaciones en cualquier orden: las horas trabajadas son salida − entrada − almuerzo (" + malTurno + " distintos)");

  window.log("\naciertos: " + window.__aciertos + " · fallas: " + window.__fallas);
  window.__listo = true;
})().catch((e) => { document.getElementById("salida").textContent += "\nERROR: " + (e && e.stack || e); window.__listo = true; window.__fallas = (window.__fallas || 0) + 1; });
