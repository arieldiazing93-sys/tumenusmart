// Prueba de la Reserva de canchas (src/lib/canchas.ts): qué horarios se ofrecen, el precio con tarifa de noche y la ficha de la
// cancha. Son cuentas puras: se prueban con casos reales de un complejo deportivo.
(async () => {
  const { ok, igual } = window;
  const C = window.Cargador;
  const c = await C.cargar("src/lib/canchas");

  const dia = (diaSemana, extra = {}) => ({
    diaSemana, trabaja: true, inicio: "08:00", fin: "23:59", descansa: false, descansoInicio: "13:00", descansoFin: "14:00", ...extra,
  });
  const semana = (extra = {}) => [0, 1, 2, 3, 4, 5, 6].map((d) => dia(d, extra));
  const h = (hhmm) => { const [a, b] = hhmm.split(":").map(Number); return a * 60 + b; };

  // =============================================================== tipos y duraciones
  window.log("== Canchas: tipos y duraciones");
  igual(c.normalizarDeporte("padel"), "padel", "un tipo que existe");
  igual(c.normalizarDeporte("rugby"), "otro", "un tipo desconocido cae en «otro»");
  igual(c.etiquetaDeDeporte("futbol5"), "Fútbol 5", "la etiqueta de fútbol 5");
  igual(c.textoDuracionCancha(60), "1 hora", "60 min = 1 hora");
  igual(c.textoDuracionCancha(90), "1 h 30", "90 min = 1 h 30");
  igual(c.textoDuracionCancha(120), "2 horas", "120 min = 2 horas");
  igual(c.textoDuracionCancha(150), "2 h 30", "150 min = 2 h 30");
  igual(c.limpiarDuraciones([120, 60, 60, 999, "90"]), [60, 90, 120], "ordena, saca repetidos e inválidos");
  igual(c.limpiarDuraciones([]), [60, 90, 120], "sin nada marcado vuelve a las de siempre");
  igual(c.limpiarDuraciones(null), [60, 90, 120], "algo roto vuelve a las de siempre");
  igual(c.normalizarPaso(60), 60, "paso de 60");
  igual(c.normalizarPaso(45), 30, "un paso raro vuelve a 30");
  ok(c.duracionManualValida(90) && c.duracionManualValida(30) && c.duracionManualValida(480), "duraciones manuales válidas");
  ok(!c.duracionManualValida(45) && !c.duracionManualValida(0) && !c.duracionManualValida(510) && !c.duracionManualValida("60"), "duraciones manuales inválidas");

  // =============================================================== precio
  window.log("== Canchas: precio con tarifa de noche");
  const dia80 = { precioHora: 80000, precioNocturnoHora: null, nocheDesde: "18:00" };
  igual(c.precioDeReserva(dia80, h("10:00"), 60), 80000, "1 hora a 80.000");
  igual(c.precioDeReserva(dia80, h("10:00"), 90), 120000, "1 h 30 = 120.000");
  igual(c.precioDeReserva(dia80, h("10:00"), 120), 160000, "2 horas = 160.000");
  const conNoche = { precioHora: 80000, precioNocturnoHora: 100000, nocheDesde: "18:00" };
  igual(c.precioDeReserva(conNoche, h("16:00"), 60), 80000, "una hora de día entera");
  igual(c.precioDeReserva(conNoche, h("18:00"), 60), 100000, "una hora de noche entera");
  igual(c.precioDeReserva(conNoche, h("17:30"), 60), 90000, "17:30 a 18:30: media hora de día + media de noche");
  igual(c.precioDeReserva(conNoche, h("17:00"), 120), 180000, "17:00 a 19:00: una de día + una de noche");
  igual(c.precioDeReserva(conNoche, h("20:00"), 90), 150000, "20:00 a 21:30 de noche = 150.000");
  igual(c.precioDeReserva({ precioHora: 75000, precioNocturnoHora: null, nocheDesde: "18:00" }, h("10:00"), 90), 112500, "75.000 por hora, hora y media = 112.500");
  ok(Number.isInteger(c.precioDeReserva({ precioHora: 25001, precioNocturnoHora: null, nocheDesde: "18:00" }, h("10:00"), 90)), "siempre un guaraní entero");
  igual(c.precioDeReserva({ precioHora: 80000, precioNocturnoHora: 100000, nocheDesde: "mal" }, h("20:00"), 60), 80000, "una hora de noche mal escrita no rompe: cobra la de día");

  // =============================================================== tramos
  window.log("== Canchas: los tramos en que está abierto");
  igual(c.tramosDeCancha(dia(1)), [{ desde: 480, hasta: 1440 }], "08:00 a 23:59 = hasta la medianoche");
  igual(c.tramosDeCancha(dia(1, { fin: "23:00" })), [{ desde: 480, hasta: 1380 }], "cierra a las 23:00");
  igual(c.tramosDeCancha(dia(1, { descansa: true, descansoInicio: "13:00", descansoFin: "16:00" })), [{ desde: 480, hasta: 780 }, { desde: 960, hasta: 1440 }], "con descanso de 13 a 16");
  igual(c.tramosDeCancha(dia(0, { trabaja: false })), [], "un día cerrado no tiene tramos");
  igual(c.tramosDeCancha(undefined), [], "sin horario no hay tramos");

  // =============================================================== horas libres de un día
  window.log("== Canchas: las horas libres de un día");
  const libres = (o) => c.horasLibresCancha({ horario: dia(1), ocupados: [], duracion: 60, paso: 30, minutoMinimo: 0, ...o });
  let r = libres({ paso: 60 });
  igual(r.length, 16, "de 08:00 a 23:00, una por hora = 16");
  igual(r[0], 480, "la primera es 08:00");
  igual(r[r.length - 1], 1380, "la última es 23:00 (termina a la medianoche)");
  r = libres({ duracion: 120 });
  igual(r.length, 29, "2 horas cada 30 min: de 08:00 a 22:00 = 29 inicios");
  igual(r[r.length - 1], 1320, "la última de 2 horas arranca 22:00");
  r = libres({ duracion: 90, paso: 60 });
  igual(r[r.length - 1], 1320, "hora y media con paso de 60: la última 22:00 (23:00 se pasaría de la medianoche)");

  const ocupada = [{ desde: h("18:00"), hasta: h("19:30") }];
  r = libres({ ocupados: ocupada });
  ok(r.includes(h("17:00")), "17:00–18:00 termina justo cuando empieza la otra: se ofrece");
  ok(!r.includes(h("17:30")), "17:30–18:30 pisa la reserva: no se ofrece");
  ok(!r.includes(h("18:00")) && !r.includes(h("18:30")) && !r.includes(h("19:00")), "durante la reserva no se ofrece nada");
  ok(r.includes(h("19:30")), "19:30 arranca justo cuando termina: se ofrece");
  r = libres({ ocupados: ocupada, duracion: 90 });
  ok(r.includes(h("16:30")) && !r.includes(h("17:00")), "de hora y media: 16:30–18:00 entra, 17:00 ya pisa");
  r = c.horasLibresCancha({ horario: dia(1, { descansa: true, descansoInicio: "13:00", descansoFin: "16:00" }), ocupados: [], duracion: 120, paso: 30, minutoMinimo: 0 });
  ok(r.includes(h("11:00")) && !r.includes(h("11:30")), "2 horas antes del descanso: 11:00 entra, 11:30 pisaría el descanso");
  ok(!r.includes(h("14:00")) && r.includes(h("16:00")), "durante el descanso no se ofrece; vuelve a las 16:00");
  r = libres({ minutoMinimo: h("18:20") });
  igual(r[0], h("18:30"), "para hoy: nada antes del mínimo (18:20 → la primera es 18:30)");
  igual(c.horasLibresCancha({ horario: dia(1), ocupados: [], duracion: 0, paso: 30, minutoMinimo: 0 }), [], "duración 0: nada");
  igual(c.horasLibresCancha({ horario: dia(1, { trabaja: false }), ocupados: [], duracion: 60, paso: 30, minutoMinimo: 0 }), [], "día cerrado: nada");
  r = libres({ ocupados: [{ desde: 0, hasta: 1440 }] });
  igual(r, [], "todo el día ocupado: nada");

  // =============================================================== el período
  window.log("== Canchas: los próximos días");
  const horarios = semana().map((d) => (d.diaSemana === 0 ? { ...d, trabaja: false } : d)); // domingo cerrado
  // 2026-10-14 es miércoles.
  const periodo = c.horasDelPeriodoCancha({ horarios, ocupadosPorDia: new Map(), duracion: 60, paso: 30, hoy: "2026-10-14", minutosAhora: h("17:00") });
  const dias = Object.keys(periodo).sort();
  ok(dias[0] === "2026-10-14", "hoy aparece mientras queden horas");
  ok(!("2026-10-18" in periodo), "el domingo (cerrado) no aparece");
  ok("2026-10-19" in periodo, "el lunes siguiente sí");
  ok(dias.length <= 60 && dias.length >= 50, "entra en la ventana de 60 días (menos los domingos)");
  igual(periodo["2026-10-14"][0], h("17:30"), "hoy 17:00: ahora + 30 min = 17:30");
  igual(periodo["2026-10-15"][0], h("08:00"), "mañana desde la apertura");
  const tardisimo = c.horasDelPeriodoCancha({ horarios, ocupadosPorDia: new Map(), duracion: 60, paso: 30, hoy: "2026-10-14", minutosAhora: h("23:10") });
  ok(!("2026-10-14" in tardisimo), "hoy a las 23:10 ya no quedan horas: no aparece");
  const llenoHoy = c.horasDelPeriodoCancha({ horarios, ocupadosPorDia: new Map([["2026-10-14", [{ desde: 0, hasta: 1440 }]]]), duracion: 60, paso: 30, hoy: "2026-10-14", minutosAhora: 0 });
  ok(!("2026-10-14" in llenoHoy) && "2026-10-15" in llenoHoy, "un día lleno desaparece, el resto no");

  const porDur = c.horasPorDuracion({ horarios, ocupadosPorDia: new Map(), duraciones: [60, 90, 120], paso: 60, hoy: "2026-10-14", minutosAhora: 0 });
  igual(Object.keys(porDur).map(Number), [60, 90, 120], "una lista de días por cada duración");
  ok(porDur[120]["2026-10-15"].length < porDur[60]["2026-10-15"].length, "una reserva más larga tiene menos horarios posibles");

  // =============================================================== choque (para anotar a mano)
  window.log("== Canchas: choque de horarios");
  ok(c.hayChoque([{ desde: 600, hasta: 660 }], 630, 690), "se pisa por el medio");
  ok(c.hayChoque([{ desde: 600, hasta: 660 }], 540, 720), "una envuelve a la otra");
  ok(!c.hayChoque([{ desde: 600, hasta: 660 }], 660, 720), "termina justo cuando empieza la otra: no choca");
  ok(!c.hayChoque([], 600, 660), "sin nada ocupado no choca");

  // =============================================================== la ficha de la cancha
  window.log("== Canchas: la ficha");
  const base = { nombre: "Cancha 1", deporte: "futbol5", superficie: "Césped sintético", techada: true, descripcion: "", fotoUrl: "", precioHora: "80.000", precioNocturnoHora: "", nocheDesde: "18:00", duraciones: [60, 90, 120], pasoMin: 30, activa: true };
  let s = c.sanearCancha(base);
  ok(s.ok, "una ficha completa pasa");
  igual(s.cancha.precioHora, 80000, "«80.000» es 80000");
  igual(s.cancha.precioNocturnoHora, null, "sin precio de noche = null");
  igual(s.cancha.descripcion, null, "descripción vacía = null");
  ok(s.cancha.techada === true, "techada se respeta");
  s = c.sanearCancha({ ...base, nombre: "   " });
  ok(!s.ok, "sin nombre se rechaza");
  s = c.sanearCancha({ ...base, deporte: "rugby" });
  ok(!s.ok, "un tipo que no existe se rechaza");
  s = c.sanearCancha({ ...base, precioHora: "abc" });
  ok(!s.ok, "un precio con letras se rechaza");
  s = c.sanearCancha({ ...base, precioHora: "0" });
  ok(!s.ok, "precio 0 se rechaza");
  s = c.sanearCancha({ ...base, precioHora: "99.999.999" });
  ok(!s.ok, "un precio con un cero de más se rechaza");
  s = c.sanearCancha({ ...base, precioNocturnoHora: "100000" });
  ok(s.ok && s.cancha.precioNocturnoHora === 100000, "con precio de noche");
  s = c.sanearCancha({ ...base, precioNocturnoHora: "xx" });
  ok(!s.ok, "un precio de noche mal escrito se rechaza");
  s = c.sanearCancha({ ...base, nocheDesde: "mal" });
  ok(s.ok && s.cancha.nocheDesde === "18:00", "una hora de noche mal escrita vuelve a 18:00");
  s = c.sanearCancha({ ...base, duraciones: [] });
  ok(s.ok && s.cancha.duraciones.length === 3, "sin duraciones vuelve a las de siempre");
  s = c.sanearCancha({ ...base, pasoMin: 45 });
  ok(s.ok && s.cancha.pasoMin === 30, "un paso raro vuelve a 30");
  s = c.sanearCancha({ ...base, fotoUrl: "http://sitio/foto.jpg" });
  ok(!s.ok, "una foto que no es https se rechaza");
  s = c.sanearCancha({ ...base, fotoUrl: "https://sitio/foto.jpg" });
  ok(s.ok && s.cancha.fotoUrl === "https://sitio/foto.jpg", "una foto https pasa");
  s = c.sanearCancha({ ...base, nombre: "x".repeat(200) });
  ok(s.ok && s.cancha.nombre.length === 60, "el nombre se recorta a 60");
  ok(!c.sanearCancha(null).ok && !c.sanearCancha("x").ok && !c.sanearCancha([]).ok, "lo que no es un objeto se rechaza");
  igual(c.leerPrecioCancha("80 000"), 80000, "«80 000» con espacio");
  igual(c.leerPrecioCancha("80.000,00"), 80000, "«80.000,00»");
  igual(c.leerPrecioCancha("12,5"), null, "con decimales no vale");
  igual(c.leerPrecioCancha("-5"), null, "negativo no vale");
  igual(c.leerPrecioCancha(""), null, "vacío no vale");

  // =============================================================== el mensaje y el código
  window.log("== Canchas: el mensaje de WhatsApp");
  igual(c.codigoDeReserva("clx9abc123xyz"), "123XYZ", "el código son los últimos 6 en mayúscula");
  const msg = c.mensajeWhatsappReservaCancha({
    negocio: "Complejo Sol",
    cliente: { nombre: "Ana", apellido: "Gómez", telefono: "595984123456", email: null, direccion: null, extras: [{ clave: "e1", etiqueta: "Equipo", valor: "Los Pumas" }] },
    canchaNombre: "Cancha 1", deporte: "Fútbol 5", fechaTexto: "Viernes 25 sep", horaInicio: "20:00", horaFin: "21:30", duracionMin: 90, total: 150000, codigo: "ABC123",
  });
  ok(msg.includes("Hola Complejo Sol") && msg.includes("*Cliente:* Ana Gómez"), "saluda y dice quién es");
  ok(msg.includes("*Teléfono:* +595984123456"), "con su teléfono");
  ok(msg.includes("*Cancha:* Cancha 1 (Fútbol 5)"), "con la cancha y el tipo");
  ok(msg.includes("*Hora:* 20:00 a 21:30 (1 h 30)"), "con la hora y la duración");
  ok(msg.includes("*Equipo:* Los Pumas"), "con los campos propios");
  ok(msg.trim().endsWith("Reserva ABC123"), "termina con el código de reserva");

  // =============================================================== una reserva anotada desde el panel
  window.log("== Canchas: una reserva anotada a mano");
  const res = { canchaId: "c1", fecha: "2026-10-16", hora: "20:00", duracion: 90, clienteNombre: "  Juan Pérez ", clienteTelefono: "0984 123 456", nota: "", precio: 150000, estado: "proxima" };
  let q = c.sanearReservaPanel(res);
  ok(q.ok, "una reserva completa pasa");
  igual(q.reserva.clienteNombre, "Juan Pérez", "el nombre sin espacios de más");
  igual(q.reserva.clienteTelefono, "595984123456", "el teléfono a la paraguaya se completa con 595");
  igual(q.reserva.nota, null, "nota vacía = null");
  ok(q.reserva.forzar === false, "sin «guardar igual» por defecto");
  q = c.sanearReservaPanel({ ...res, clienteTelefono: "" });
  ok(q.ok && q.reserva.clienteTelefono === null, "el teléfono es opcional");
  q = c.sanearReservaPanel({ ...res, clienteTelefono: "12" });
  ok(!q.ok, "un teléfono mal escrito se rechaza");
  q = c.sanearReservaPanel({ ...res, clienteNombre: "   " });
  ok(!q.ok, "sin nombre se rechaza");
  q = c.sanearReservaPanel({ ...res, canchaId: "" });
  ok(!q.ok, "sin cancha se rechaza");
  q = c.sanearReservaPanel({ ...res, fecha: "2026-02-30" });
  ok(!q.ok, "un día que no existe se rechaza");
  q = c.sanearReservaPanel({ ...res, fecha: "16/10/2026" });
  ok(!q.ok, "una fecha mal escrita se rechaza");
  q = c.sanearReservaPanel({ ...res, hora: "25:00" });
  ok(!q.ok, "una hora que no existe se rechaza");
  q = c.sanearReservaPanel({ ...res, duracion: 45 });
  ok(!q.ok, "una duración que no es múltiplo de 30 se rechaza");
  q = c.sanearReservaPanel({ ...res, duracion: "90" });
  ok(!q.ok, "una duración que llega como texto se rechaza");
  q = c.sanearReservaPanel({ ...res, hora: "23:00", duracion: 90 });
  ok(!q.ok, "una reserva que pasaría de la medianoche se rechaza");
  q = c.sanearReservaPanel({ ...res, hora: "22:30", duracion: 90 });
  ok(q.ok, "22:30 + 90 min llega justo a la medianoche: pasa");
  q = c.sanearReservaPanel({ ...res, precio: -1 });
  ok(!q.ok, "precio negativo se rechaza");
  q = c.sanearReservaPanel({ ...res, precio: 1000.5 });
  ok(!q.ok, "precio con decimales se rechaza");
  q = c.sanearReservaPanel({ ...res, precio: 0 });
  ok(q.ok, "precio 0 pasa (una cortesía)");
  q = c.sanearReservaPanel({ ...res, estado: "volando" });
  ok(!q.ok, "un estado que no existe se rechaza");
  q = c.sanearReservaPanel({ ...res, forzar: true });
  ok(q.ok && q.reserva.forzar === true, "«guardar igual» se respeta");
  q = c.sanearReservaPanel({ ...res, nota: "x".repeat(500) });
  ok(q.ok && q.reserva.nota.length === 300, "la nota se recorta a 300");
  ok(!c.sanearReservaPanel(null).ok && !c.sanearReservaPanel([]).ok, "lo que no es un objeto se rechaza");
  ok(c.estadoLiberaHorario("cancelada") && c.estadoLiberaHorario("no_asistio"), "cancelada y no asistió liberan el horario");
  ok(!c.estadoLiberaHorario("pendiente") && !c.estadoLiberaHorario("proxima") && !c.estadoLiberaHorario("finalizada"), "los demás lo ocupan");

  window.log("== Canchas: las direcciones del calendario");
  const pc = { fecha: "2026-10-16", tipo: null, canceladas: false };
  igual(c.urlCanchas(pc), "/admin/canchas?fecha=2026-10-16", "solo la fecha");
  igual(c.urlCanchas(pc, { tipo: "padel", canceladas: true }), "/admin/canchas?fecha=2026-10-16&tipo=padel&canceladas=1", "con tipo y canceladas");
  igual(c.urlReservaCancha(pc, "nueva", { cancha: "c1", hora: "18:30" }), "/admin/canchas?fecha=2026-10-16&reserva=nueva&cancha=c1&hora=18%3A30", "una reserva nueva con cancha y hora");
  igual(c.urlReservaCancha(pc, "abc"), "/admin/canchas?fecha=2026-10-16&reserva=abc", "el detalle de una reserva");

  // =============================================================== el tablero de la página pública
  window.log("== Canchas: el tablero (todas las canchas por día)");
  const porCancha = new Map([
    ["c1", { 60: { "2026-10-14": [1080, 1110], "2026-10-15": [600] }, 90: { "2026-10-14": [1080] } }],
    ["c2", { 60: { "2026-10-15": [720, 750] }, 90: {} }],
  ]);
  const v = c.ventanaDeDisponibilidad(porCancha, "2026-10-14", 2);
  igual(Object.keys(v).sort(), ["2026-10-14", "2026-10-15"], "los días con horarios");
  igual(v["2026-10-14"], { c1: { 60: [1080, 1110], 90: [1080] } }, "el 14: solo la cancha 1 tiene horarios");
  igual(v["2026-10-15"], { c1: { 60: [600] }, c2: { 60: [720, 750] } }, "el 15: las dos canchas, por duración");
  igual(Object.keys(c.ventanaDeDisponibilidad(porCancha, "2026-10-14", 1)), ["2026-10-14"], "una ventana de un día no trae el siguiente");
  igual(c.ventanaDeDisponibilidad(porCancha, "2026-11-01", 5), {}, "un período sin nada da un tablero vacío");
  igual(c.ventanaDeDisponibilidad(new Map(), "2026-10-14", 14), {}, "sin canchas, vacío");
  igual(c.DIAS_POR_VENTANA, 14, "se piden de a catorce días");

  window.log("\naciertos: " + window.__aciertos + " · fallas: " + window.__fallas);
  window.__listo = true;
})().catch((e) => { document.getElementById("salida").textContent += "\nERROR: " + (e && e.stack || e); window.__listo = true; window.__fallas = (window.__fallas || 0) + 1; });
