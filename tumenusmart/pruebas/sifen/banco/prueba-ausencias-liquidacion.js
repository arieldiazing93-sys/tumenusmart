// Prueba de las ausencias y la liquidación del Registro de asistencia (src/lib/ausencias.ts, src/lib/liquidacion-asistencia.ts y la parte
// de faltas de src/lib/reporte-asistencia.ts): días de trabajo por persona, qué pasó cada día, mensual y jornal, y los reportes con una
// base de mentira. Las fechas de la liquidación son de septiembre de 2026 (todo pasado), así no depende del día en que se corra.
(async () => {
  const { ok, igual } = window;
  const C = window.Cargador;
  const a = await C.cargar("src/lib/ausencias");
  const liq = await C.cargar("src/lib/liquidacion-asistencia");
  const rep = await C.cargar("src/lib/reporte-asistencia");

  window.log("== Días de trabajo");
  igual(a.resumenDeDiasTrabajo([1, 2, 3, 4, 5, 6]), "Lun a Sáb", "lunes a sábado");
  igual(a.resumenDeDiasTrabajo([1, 2, 3, 4, 5]), "Lun a Vie", "lunes a viernes");
  igual(a.resumenDeDiasTrabajo([1, 3, 5]), "Lun, Mié y Vie", "lunes, miércoles y viernes");
  igual(a.resumenDeDiasTrabajo([0]), "Dom", "solo domingo");
  igual(a.resumenDeDiasTrabajo([6, 0]), "Sáb y Dom", "sábado y domingo");
  igual(a.resumenDeDiasTrabajo([1, 2]), "Lun y Mar", "dos días seguidos no se resumen con «a»");
  igual(a.resumenDeDiasTrabajo([1, 2, 3, 5]), "Lun a Mié y Vie", "una tanda de tres y un día suelto");
  igual(a.resumenDeDiasTrabajo([0, 1, 2, 3, 4, 5, 6]), "Todos los días", "los siete");
  igual(a.resumenDeDiasTrabajo([5, 1, 3]), "Lun, Mié y Vie", "no importa el orden en que vengan");
  igual(a.diasTrabajoValidos([]), null, "ninguno no vale");
  igual(a.diasTrabajoValidos([7]), null, "el 7 no es un día");
  igual(a.diasTrabajoValidos(["1", "2"]), [1, 2], "acepta números en texto");
  igual(a.diasTrabajoValidos([1, 1, 2]), [1, 2], "sin repetidos");
  igual(a.diasTrabajoValidos([0, 6, 1]), [1, 6, 0], "en el orden de la semana, lunes primero");
  igual(a.normalizarDiasTrabajo(null), [1, 2, 3, 4, 5, 6], "sin dato: lunes a sábado");
  igual(a.normalizarDiasTrabajo([]), [1, 2, 3, 4, 5, 6], "vacío: lunes a sábado");

  window.log("== Fechas");
  ok(a.esDiaValido("2026-09-30") && !a.esDiaValido("2026-02-30") && !a.esDiaValido("2026-9-3") && !a.esDiaValido(""), "días válidos e inválidos");
  igual(a.diaSemanaDeClave("2026-10-15"), 4, "el 15/10/2026 es jueves");
  igual(a.diaSemanaDeClave("2026-09-06"), 0, "el 06/09/2026 es domingo");
  igual(a.diasEntre("2026-09-29", "2026-10-02"), ["2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02"], "diasEntre incluye los extremos y cruza de mes");
  igual(a.diasEntre("2026-09-30", "2026-09-29"), [], "al revés no hay días");
  igual(a.finDeMes("2026-02-10"), "2026-02-28", "febrero 2026");
  igual(a.finDeMes("2028-02-01"), "2028-02-29", "febrero bisiesto");
  igual(a.finDeMes("2026-10-15"), "2026-10-31", "octubre");

  window.log("== Tipos de ausencia");
  igual(a.TIPOS_AUSENCIA.map((t) => t.valor), ["reposo", "aviso", "permiso", "vacaciones", "feriado", "falta"], "seis tipos");
  ok(a.datosDeTipo("reposo").pagado === true && a.datosDeTipo("vacaciones").pagado && a.datosDeTipo("feriado").pagado && a.datosDeTipo("permiso").pagado, "reposo, vacaciones, feriado y permiso se pagan por defecto");
  ok(a.datosDeTipo("aviso").pagado === false && a.datosDeTipo("falta").pagado === false, "avisó y falta sin aviso no");
  igual(a.etiquetaDeAusencia("reposo"), "Reposo médico", "etiqueta del reposo");
  igual(a.etiquetaDeAusencia("raro"), "raro", "un tipo desconocido devuelve el mismo texto");
  ok(a.esTipoAusencia("aviso") && !a.esTipoAusencia("huelga"), "esTipoAusencia");

  window.log("== Qué pasó cada día");
  const marca = (...d) => new Set(d);
  const aus = (id, desde, hasta, tipo, pagado, nota = null) => ({ id, colaboradorId: "P", desde, hasta, tipo, pagado, nota });
  const semana = a.clasificarDias({
    desde: "2026-10-12", hasta: "2026-10-18", hoy: "2026-10-16", diasTrabajo: [1, 2, 3, 4, 5, 6], controlDesde: "2026-10-01",
    diasConMarcacion: marca("2026-10-12", "2026-10-13"), ausencias: [aus("r1", "2026-10-14", "2026-10-14", "reposo", true)],
  });
  igual(semana.map((d) => d.estado), ["trabajo", "trabajo", "justificado", "falta", "pendiente", "futuro", "descanso"], "lunes a domingo con hoy el viernes");
  ok(semana[2].pagado === true && semana[2].ausencia.id === "r1", "el justificado trae su registro y si se paga");
  const extra = a.clasificarDias({
    desde: "2026-10-18", hasta: "2026-10-18", hoy: "2026-10-20", diasTrabajo: [1, 2, 3, 4, 5, 6], controlDesde: "2026-10-01",
    diasConMarcacion: marca("2026-10-18"), ausencias: [],
  });
  igual(extra[0].estado, "extra", "marcó un domingo que no era su día: día extra");
  const antes = a.clasificarDias({
    desde: "2026-10-12", hasta: "2026-10-13", hoy: "2026-10-20", diasTrabajo: [1, 2, 3, 4, 5, 6], controlDesde: "2026-10-14",
    diasConMarcacion: marca(), ausencias: [aus("r2", "2026-10-13", "2026-10-13", "aviso", false)],
  });
  igual(antes.map((d) => d.estado), ["sin_control", "justificado"], "antes del alta no es falta, pero lo anotado sí cuenta");
  const baja = a.clasificarDias({
    desde: "2026-10-12", hasta: "2026-10-14", hoy: "2026-10-20", diasTrabajo: [1, 2, 3, 4, 5, 6], controlDesde: "2026-10-01", controlHasta: "2026-10-12",
    diasConMarcacion: marca("2026-10-12"), ausencias: [],
  });
  igual(baja.map((d) => d.estado), ["trabajo", "sin_control", "sin_control"], "después de la baja no es falta");
  const enDescanso = a.clasificarDias({
    desde: "2026-10-17", hasta: "2026-10-19", hoy: "2026-10-30", diasTrabajo: [1, 2, 3, 4, 5, 6], controlDesde: "2026-10-01",
    diasConMarcacion: marca(), ausencias: [aus("r3", "2026-10-17", "2026-10-19", "vacaciones", true)],
  });
  igual(enDescanso.map((d) => d.estado), ["justificado", "descanso", "justificado"], "unas vacaciones que cruzan el domingo: el domingo no cuenta");
  const trabajoConAusencia = a.clasificarDias({
    desde: "2026-10-14", hasta: "2026-10-14", hoy: "2026-10-20", diasTrabajo: [1, 2, 3, 4, 5, 6], controlDesde: "2026-10-01",
    diasConMarcacion: marca("2026-10-14"), ausencias: [aus("r4", "2026-10-14", "2026-10-14", "reposo", true)],
  });
  igual(trabajoConAusencia[0].estado, "trabajo", "si marcó, trabajó (aunque haya algo anotado)");
  const soloLunes = a.clasificarDias({
    desde: "2026-10-12", hasta: "2026-10-18", hoy: "2026-10-30", diasTrabajo: [1], controlDesde: "2026-10-01",
    diasConMarcacion: marca(), ausencias: [],
  });
  igual(soloLunes.filter((d) => d.estado === "falta").length, 1, "quien solo va los lunes tiene una falta en la semana, no seis");

  window.log("== Resumen de días");
  const res = a.resumirDias(semana);
  igual(res, { esperados: 6, trabajados: 2, extra: 0, justificadosPagados: 1, justificadosSinGoce: 0, faltas: 1, pendientes: 1, futuros: 1 }, "resumen de la semana");

  window.log("== Cuánto vale un mes");
  igual(a.valorDelDia(2800000), 93333, "un día de 2.800.000 vale 93.333");
  igual(a.sueldoDelPeriodo(3000000, "2026-10-01", "2026-10-31"), 3000000, "octubre completo (31 días) = el salario");
  igual(a.sueldoDelPeriodo(3000000, "2026-02-01", "2026-02-28"), 3000000, "febrero completo (28 días) = el salario");
  igual(a.sueldoDelPeriodo(3000000, "2026-09-01", "2026-09-30"), 3000000, "septiembre completo = el salario");
  igual(a.sueldoDelPeriodo(3000000, "2026-10-01", "2026-10-15"), 1500000, "medio mes = 15 ÷ 30");
  igual(a.sueldoDelPeriodo(3000000, "2026-10-16", "2026-11-15"), 3100000, "de mitad a mitad: 16/30 + 15/30");
  igual(a.sueldoDelPeriodo(3000000, "2026-10-15", "2026-10-15"), 100000, "un día = salario ÷ 30");
  igual(a.sueldoDelPeriodo(0, "2026-10-01", "2026-10-31"), 0, "sin monto no hay nada");

  window.log("== Liquidar");
  const base = { desde: "2026-09-01", hasta: "2026-09-30" };
  const m = a.liquidar({ forma: "mensual", monto: 3000000, ...base, resumen: { ...res, faltas: 2, justificadosSinGoce: 1 } });
  igual(m, { bruto: 3000000, descuento: 300000, neto: 2700000, valorDia: 100000, diasLiquidados: 3 }, "mensual: 2 faltas + 1 sin goce = 3 días de descuento");
  const mTope = a.liquidar({ forma: "mensual", monto: 300000, ...base, resumen: { ...res, faltas: 40 } });
  igual(mTope.descuento, 300000, "el descuento nunca pasa de lo que le corresponde");
  igual(mTope.neto, 0, "y el neto no es negativo");
  const j = a.liquidar({ forma: "jornal", monto: 120000, ...base, resumen: { ...res, trabajados: 20, justificadosPagados: 2, faltas: 3 } });
  igual(j, { bruto: 2640000, descuento: 0, neto: 2640000, valorDia: 120000, diasLiquidados: 22 }, "jornal: 20 trabajados + 2 justificados pagos = 22 jornales");
  igual(a.liquidar({ forma: null, monto: 100000, ...base, resumen: res }).neto, 0, "sin forma de pago no calcula");
  igual(a.liquidar({ forma: "jornal", monto: 0, ...base, resumen: res }).neto, 0, "sin monto no calcula");
  igual(a.etiquetaDeFormaDePago("jornal"), "Jornal", "etiqueta jornal");
  igual(a.etiquetaDeFormaDePago(null), "Sin definir", "etiqueta sin definir");
  ok(a.esFormaDePago("mensual") && a.esFormaDePago("jornal") && !a.esFormaDePago("quincenal"), "esFormaDePago");

  window.log("== Período de la liquidación");
  const p1 = liq.periodoDeLiquidacion("rango", "2026-09-01", "2026-09-30");
  igual(p1, { activa: "rango", desde: "2026-09-01", hasta: "2026-09-30" }, "rango pedido");
  const hoyReal = new Date().toLocaleDateString("en-CA", { timeZone: "America/Asuncion" });
  const p2 = liq.periodoDeLiquidacion("hoy");
  ok(p2.desde === hoyReal && p2.hasta === hoyReal, "«hoy» es un solo día: " + JSON.stringify(p2));
  const p3 = liq.periodoDeLiquidacion();
  ok(p3.activa === "mes" && p3.desde === hoyReal.slice(0, 8) + "01" && p3.hasta === a.finDeMes(hoyReal), "sin nada pedido: este mes completo: " + JSON.stringify(p3));

  window.log("== Liquidación con una base de mentira (septiembre de 2026)");
  const colab = (id, nombre, extra) => ({
    id, nombre, apellido: null, cargo: null, activo: true, fotoUrl: null, diasTrabajo: [1, 2, 3, 4, 5, 6], tipoPago: null, montoPago: 0,
    createdAt: new Date("2026-08-01T12:00:00Z"), ...extra,
  });
  const septiembre = a.diasEntre("2026-09-01", "2026-09-30");
  const laborables = (dias) => septiembre.filter((d) => dias.includes(a.diaSemanaDeClave(d)));
  const marcas = [];
  const marcarDias = (id, dias, tardanzas = {}) => {
    for (const d of dias) marcas.push({ colaboradorId: id, dia: d, tipo: "entrada", tardanzaMin: tardanzas[d] ?? 0 });
  };
  // A: mensual 3.000.000, lunes a sábado. Falta el 8, reposo pagado el 9, aviso sin goce el 10, y fue un domingo (el 13).
  const diasA = laborables([1, 2, 3, 4, 5, 6]).filter((d) => !["2026-09-08", "2026-09-09", "2026-09-10"].includes(d));
  marcarDias("A", [...diasA, "2026-09-13"], { "2026-09-02": 12 });
  // B: jornal 100.000, lunes, miércoles y viernes. Falta el 14, vacaciones pagadas el 16, aviso sin goce el 18.
  const diasB = laborables([1, 3, 5]).filter((d) => !["2026-09-14", "2026-09-16", "2026-09-18"].includes(d));
  marcarDias("B", diasB);
  // C: sin forma de pago, fue algunos días.
  marcarDias("C", ["2026-09-01", "2026-09-02", "2026-09-03"]);
  // E: dada de baja; marcó hasta el 10.
  marcarDias("E", laborables([1, 2, 3, 4, 5, 6]).filter((d) => d <= "2026-09-10"));
  const colaboradores = [
    colab("A", "Ana Acosta", { tipoPago: "mensual", montoPago: 3000000, cargo: "Cajera" }),
    colab("B", "Beto Benítez", { tipoPago: "jornal", montoPago: 100000, diasTrabajo: [1, 3, 5] }),
    colab("C", "Carla Cabral"),
    colab("D", "Darío Díaz", { activo: false }),
    colab("E", "Elena Estigarribia", { activo: false, tipoPago: "mensual", montoPago: 3000000 }),
  ];
  const registros = [
    { id: "r-a-9", colaboradorId: "A", desde: "2026-09-09", hasta: "2026-09-09", tipo: "reposo", pagado: true, nota: "Certificado del Dr. Pérez" },
    { id: "r-a-10", colaboradorId: "A", desde: "2026-09-10", hasta: "2026-09-10", tipo: "aviso", pagado: false, nota: null },
    { id: "r-b-16", colaboradorId: "B", desde: "2026-09-16", hasta: "2026-09-16", tipo: "vacaciones", pagado: true, nota: null },
    { id: "r-b-18", colaboradorId: "B", desde: "2026-09-18", hasta: "2026-09-18", tipo: "aviso", pagado: false, nota: null },
  ];
  const db = {
    colaborador: { findMany: async () => colaboradores },
    marcacionAsistencia: {
      findMany: async ({ where, take }) => marcas.filter((x) => x.dia >= where.dia.gte && x.dia <= where.dia.lte).slice(0, take),
    },
    ausenciaColaborador: { findMany: async () => registros },
  };

  const l = await liq.cargarLiquidacion(db, { desde: "2026-09-01", hasta: "2026-09-30" });
  igual(l.filas.map((f) => f.id), ["A", "B", "C", "E"], "D (inactiva y sin marcaciones) no aparece");
  const fA = l.filas.find((f) => f.id === "A");
  const fB = l.filas.find((f) => f.id === "B");
  const fC = l.filas.find((f) => f.id === "C");
  const fE = l.filas.find((f) => f.id === "E");
  ok(laborables([1, 2, 3, 4, 5, 6]).length === 26, "septiembre 2026 tiene 26 días de lunes a sábado");
  igual(
    { esperados: fA.resumen.esperados, trabajados: fA.resumen.trabajados, extra: fA.resumen.extra, pag: fA.resumen.justificadosPagados, sin: fA.resumen.justificadosSinGoce, faltas: fA.resumen.faltas },
    { esperados: 26, trabajados: 24, extra: 1, pag: 1, sin: 1, faltas: 1 },
    "A: 26 días, fue 23 + 1 extra, un reposo pagado, un aviso sin goce y una falta"
  );
  igual(fA.liquidacion, { bruto: 3000000, descuento: 200000, neto: 2800000, valorDia: 100000, diasLiquidados: 2 }, "A: se descuentan la falta y el día sin goce (2 × 100.000)");
  igual({ t: fA.tardanzas, min: fA.minutosTarde }, { t: 1, min: 12 }, "A llegó tarde una vez, 12 minutos (informativo)");
  igual(fB.resumen.esperados, 13, "B tiene 13 días de lunes, miércoles y viernes");
  igual(
    { trabajados: fB.resumen.trabajados, pag: fB.resumen.justificadosPagados, sin: fB.resumen.justificadosSinGoce, faltas: fB.resumen.faltas },
    { trabajados: 10, pag: 1, sin: 1, faltas: 1 },
    "B: fue 10, vacaciones pagadas, un aviso sin goce y una falta"
  );
  igual(fB.liquidacion.neto, 1100000, "B (jornal): 10 días + 1 de vacaciones = 11 × 100.000");
  ok(fC.sinFormaDePago && fC.liquidacion.neto === 0, "C no tiene forma de pago: no se calcula");
  ok(fC.resumen.faltas === 23, "C: 26 días menos 3 que fue = 23 faltas (se cuentan igual): " + fC.resumen.faltas);
  ok(fE.resumen.faltas === 0 && fE.resumen.trabajados === laborables([1, 2, 3, 4, 5, 6]).filter((d) => d <= "2026-09-10").length, "E (de baja): sin faltas después de su última marcación");
  igual(l.totales.neto, 2800000 + 1100000 + fE.liquidacion.neto, "el total a pagar suma lo de cada persona");
  igual(l.totales.sinFormaDePago, 1, "una persona sin forma de pago");
  const diaReposo = fA.detalle.find((d) => d.dia === "2026-09-09");
  ok(diaReposo && diaReposo.efecto === "paga" && diaReposo.nota === "Certificado del Dr. Pérez" && diaReposo.etiqueta.includes("Reposo médico"), "el detalle trae el reposo con su comentario");
  const diaFalta = fA.detalle.find((d) => d.dia === "2026-09-08");
  ok(diaFalta && diaFalta.efecto === "descuenta" && diaFalta.etiqueta === "Falta sin aviso", "el detalle marca la falta");
  ok(fA.detalle.find((d) => d.dia === "2026-09-13").etiqueta.includes("libre"), "el domingo trabajado figura como día libre trabajado");
  ok(!fA.detalle.some((d) => d.dia === "2026-09-06"), "los domingos de descanso no aparecen en el detalle");

  const corta = await liq.cargarLiquidacion(db, { desde: "2026-01-01", hasta: "2026-09-30" });
  ok(corta.recortado && a.diasEntre(corta.desde, corta.hasta).length === 62, "más de 62 días se acota a 62");

  window.log("== Marcaciones: faltas y ausencias");
  const hoy = hoyReal;
  const reporteDb = (extraColab, extraMarcas, extraRegistros) => ({
    colaborador: { findMany: async () => [...colaboradores, ...extraColab] },
    marcacionAsistencia: {
      findMany: async ({ where, take }) =>
        [...marcas, ...extraMarcas]
          .filter((x) => x.dia >= where.dia.gte && x.dia <= where.dia.lte)
          .map((x) => ({ id: `${x.colaboradorId}-${x.dia}`, fecha: new Date(`${x.dia}T11:00:00Z`), fotoUrl: null, verificada: true, distanciaRostro: null, metodo: "pin", ...x }))
          .slice(0, take),
    },
    ausenciaColaborador: { findMany: async () => [...registros, ...extraRegistros] },
  });
  const r1 = await rep.cargarReporteAsistencia(reporteDb([], [], []), { desde: "2026-09-01", hasta: "2026-09-30" }, 7000);
  const filaFalta = r1.ausencias.find((f) => f.colaboradorId === "A" && f.estado === "falta");
  ok(filaFalta && filaFalta.dia === "2026-09-08" && filaFalta.etiqueta === "Falta sin aviso", "A: la falta del 8 aparece");
  const filaReposo = r1.ausencias.find((f) => f.ausenciaId === "r-a-9");
  ok(filaReposo && filaReposo.estado === "justificado" && filaReposo.pagado && filaReposo.nota === "Certificado del Dr. Pérez" && filaReposo.etiqueta === "Reposo médico", "A: el reposo aparece con su comentario");
  ok(r1.faltas === 1 + 1 + 23 + 0, "faltas sin aviso del mes (A 1, B 1, C 23, E 0): " + r1.faltas);
  igual(r1.justificados, 4, "cuatro días justificados (A 2, B 2)");
  ok(!r1.ausencias.some((f) => f.colaboradorId === "D"), "D (inactiva sin marcaciones) no aparece");
  const resA = r1.resumenPorPersona.find((x) => x.persona.id === "A");
  igual({ f: resA.faltas, j: resA.justificados }, { f: 1, j: 2 }, "el resumen de A trae faltas y justificados");
  ok(r1.faltasNoCalculadas === false, "con pocas marcaciones se calculan las faltas");

  // Un reposo de tres días seguidos es UNA fila, y sus días de descanso no cuentan.
  const reposoLargo = { id: "r-c-largo", colaboradorId: "C", desde: "2026-09-04", hasta: "2026-09-08", tipo: "reposo", pagado: true, nota: "Fractura" };
  const r2 = await rep.cargarReporteAsistencia(reporteDb([], [], [reposoLargo]), { desde: "2026-09-01", hasta: "2026-09-30", buscar: "Carla" }, 7000);
  const largo = r2.ausencias.find((f) => f.ausenciaId === "r-c-largo");
  ok(largo && largo.dias === 4 && largo.dia === "2026-09-04" && largo.hasta === "2026-09-08", "un reposo del vie 4 al mar 8 es una fila de 4 días laborables (el domingo 6 no cuenta): " + JSON.stringify(largo && { d: largo.dias, a: largo.dia, h: largo.hasta }));
  ok(r2.ausencias.every((f) => f.colaboradorId === "C"), "con la búsqueda solo salen las ausencias de esa persona");

  // Hoy: quien tenía que ir y todavía no marcó figura como pendiente (no como falta).
  const todosLosDias = [0, 1, 2, 3, 4, 5, 6];
  const nueva = colab("F", "Fabián Franco", { diasTrabajo: todosLosDias, createdAt: new Date("2026-01-01T12:00:00Z") });
  const r3 = await rep.cargarReporteAsistencia(reporteDb([nueva], [], []), { desde: hoy, hasta: hoy }, 7000);
  const pend = r3.ausencias.find((f) => f.colaboradorId === "F");
  ok(pend && pend.estado === "pendiente" && pend.etiqueta === "Todavía no marcó", "hoy sin marcar es «Todavía no marcó», no falta");
  ok(!r3.ausencias.some((f) => f.estado === "falta"), "hoy no hay faltas todavía");

  // Con la lista de marcaciones cortada no se puede asegurar quién faltó.
  const r4 = await rep.cargarReporteAsistencia(reporteDb([], [], []), { desde: "2026-09-01", hasta: "2026-09-30" }, 5);
  ok(r4.hayMas && r4.faltasNoCalculadas && !r4.ausencias.some((f) => f.estado === "falta"), "tope de marcaciones: no se inventan faltas");
  ok(r4.ausencias.some((f) => f.estado === "justificado"), "pero los motivos ya anotados se muestran igual");

  window.log("\naciertos: " + window.__aciertos + " · fallas: " + window.__fallas);
  window.__listo = true;
})().catch((e) => { document.getElementById("salida").textContent += "\nERROR: " + (e && e.stack || e); window.__listo = true; window.__fallas = (window.__fallas || 0) + 1; });
