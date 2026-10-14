// Prueba de lo nuevo del Servicio comedor: la comisión del mozo (src/lib/comision-mozo.ts) y el juntar lo cargado con cantidades y pesos
// (sumarCargaALista, src/lib/cantidad-escrita.ts). Son cuentas puras: se prueban con todos los casos.
(async () => {
  const { ok, igual } = window;
  const C = window.Cargador;

  const cm = await C.cargar("src/lib/comision-mozo");
  const ce = await C.cargar("src/lib/cantidad-escrita");

  // =============================================================== el porcentaje que escribe el dueño
  window.log("== Comisión del mozo: el porcentaje");
  igual(cm.leerPorcentajeDeComision(""), { ok: true, valor: null }, "vacío = sin comisión");
  igual(cm.leerPorcentajeDeComision(null), { ok: true, valor: null }, "nada = sin comisión");
  igual(cm.leerPorcentajeDeComision("0"), { ok: true, valor: null }, "0 = sin comisión");
  igual(cm.leerPorcentajeDeComision("5"), { ok: true, valor: 5 }, "5");
  igual(cm.leerPorcentajeDeComision("7,5"), { ok: true, valor: 7.5 }, "7,5 con coma");
  igual(cm.leerPorcentajeDeComision("7.5"), { ok: true, valor: 7.5 }, "7.5 con punto");
  igual(cm.leerPorcentajeDeComision("100"), { ok: true, valor: 100 }, "100");
  igual(cm.leerPorcentajeDeComision(" 12 "), { ok: true, valor: 12 }, "con espacios");
  for (const malo of ["101", "-5", "abc", "5%", "1,234", "1e2", "5,5,5", "1000"]) {
    ok(cm.leerPorcentajeDeComision(malo).ok === false, `«${malo}» se rechaza`);
  }

  // =============================================================== la base de la comisión
  window.log("== Comisión del mozo: la base");
  const esServicio = (id) => id === "corte";
  const cuenta = [
    { productId: "lomito", precioUnitario: 40000, cantidad: 2 }, // 80.000
    { productId: "cerveza", precioUnitario: 10000, cantidad: 3 }, // 30.000
    { productId: "corte", precioUnitario: 50000, cantidad: 1 }, // servicio: no cuenta
    { productId: null, precioUnitario: 20000, cantidad: 1 }, // un combo mitad y mitad: es comida
  ];
  igual(cm.baseDeComision(cuenta, esServicio, 0), 130000, "los productos (sin el servicio): 80.000 + 30.000 + 20.000");
  igual(cm.baseDeComision(cuenta, () => false, 0), 180000, "si nada es servicio, todo cuenta");
  // un descuento de 18.000 sobre 180.000: los productos son 130.000 (72,2 %): se llevan 13.000 del descuento
  igual(cm.baseDeComision(cuenta, esServicio, 18000), 117000, "con 18.000 de descuento: a los productos les toca 13.000 → 117.000");
  igual(cm.baseDeComision([{ productId: "lomito", precioUnitario: 40000, cantidad: 1 }], esServicio, 4000), 36000, "una cuenta de un producto con descuento");
  igual(cm.baseDeComision([], esServicio, 0), 0, "una cuenta sin nada: 0");
  igual(cm.baseDeComision([{ productId: "corte", precioUnitario: 50000, cantidad: 1 }], esServicio, 0), 0, "solo servicios: 0");
  igual(cm.baseDeComision([{ productId: "lomito", precioUnitario: 0, cantidad: 3 }], esServicio, 0), 0, "una cortesía (precio 0): 0");
  igual(cm.baseDeComision([{ productId: "lomito", precioUnitario: 25000, cantidad: 0.5 }], esServicio, 0), 12500, "media porción (cuenta dividida)");
  ok(cm.baseDeComision([{ productId: "lomito", precioUnitario: 40000, cantidad: 1 }], esServicio, 999999) === 0, "un descuento mayor que la cuenta no da base negativa");

  // =============================================================== el monto
  window.log("== Comisión del mozo: el monto");
  igual(cm.montoDeComision(117000, 5), 5850, "5 % de 117.000 = 5.850");
  igual(cm.montoDeComision(100000, 7.5), 7500, "7,5 % de 100.000 = 7.500");
  igual(cm.montoDeComision(33333, 10), 3333, "10 % de 33.333 = 3.333 (al guaraní)");
  igual(cm.montoDeComision(35, 50), 18, "17,5 sube a 18 (la mitad sube)");
  ok(Number.isInteger(cm.montoDeComision(123457, 6.25)), "siempre un entero");

  // =============================================================== juntar lo cargado
  window.log("== Cargar con cantidad y peso: juntar en la lista");
  const linea = (key, cantidad, peso) => ({ key, tipo: "producto", cantidad, ...(peso !== undefined ? { peso } : {}) });
  let r = ce.sumarCargaALista([], linea("a", 35));
  ok(r.ok && r.lista.length === 1 && r.lista[0].cantidad === 35, "una línea nueva con 35");
  r = ce.sumarCargaALista([linea("a", 35)], linea("a", 10));
  ok(r.ok && r.lista.length === 1 && r.lista[0].cantidad === 45, "35 + 10 = 45 en la misma línea");
  r = ce.sumarCargaALista([linea("a", 990)], linea("a", 50));
  ok(r.ok && r.lista[0].cantidad === 1000, "no pasa del tope de 1000");
  r = ce.sumarCargaALista([linea("a", 1)], linea("b", 1));
  ok(r.ok && r.lista.length === 2, "otro producto es otra línea");
  r = ce.sumarCargaALista([], linea("k", 1, 0.285));
  ok(r.ok && r.lista[0].peso === 0.285 && r.lista[0].cantidad === 1, "una pesada nueva: 0,285");
  r = ce.sumarCargaALista([linea("k", 1, 0.25)], linea("k", 1, 0.25));
  ok(r.ok && r.lista.length === 1 && r.lista[0].peso === 0.5 && r.lista[0].cantidad === 1, "0,250 + 0,250 = 0,500 en una línea");
  r = ce.sumarCargaALista([linea("k", 1, 0.1)], linea("k", 1, 0.2));
  ok(r.ok && r.lista[0].peso === 0.3, "0,1 + 0,2 = 0,3 justo");
  r = ce.sumarCargaALista([linea("k", 2, 0.35)], linea("k", 1, 0.3));
  ok(r.ok && r.lista[0].peso === 1 && r.lista[0].cantidad === 1, "2 porciones de 0,35 + 0,3 = 1 kilo en una línea");
  r = ce.sumarCargaALista([linea("k", 2)], linea("k", 1, 0.5));
  ok(r.ok && r.lista[0].peso === 2.5, "2 kilos sin pesar + 0,5 = 2,5 kg");
  r = ce.sumarCargaALista([linea("k", 1, 999)], linea("k", 1, 1));
  ok(!r.ok && typeof r.error === "string", "pasar de 999,999 kilos se rechaza");
  const original = [linea("k", 1, 0.25)];
  ce.sumarCargaALista(original, linea("k", 1, 0.25));
  ok(original[0].peso === 0.25, "la lista original no se toca");

  // =============================================================== lo que se le debe y el pago de la comisión
  window.log("== Pago de comisiones: lo que se le debe");
  igual(cm.comisionPendiente(100000, 30000), 70000, "ganó 100.000, se le pagaron 30.000: se le deben 70.000");
  igual(cm.comisionPendiente(100000, 100000), 0, "pagado todo: 0");
  igual(cm.comisionPendiente(50000, 80000), 0, "si se le pagó de más (se canceló una venta), debe 0 y no queda negativo");
  igual(cm.comisionPendiente(0, 0), 0, "sin nada: 0");
  igual(cm.comisionPendiente(1000.4, 0.2), 1000, "redondea al guaraní");

  window.log("== Pago de comisiones: validar el pago");
  const v = (d, p) => cm.validarPagoDeComision(d, p);
  let pv = v({ monto: 70000 }, 70000);
  ok(pv.ok && pv.pago.monto === 70000 && pv.pago.desde === null && pv.pago.hasta === null && pv.pago.nota === null, "pagar todo lo que se le debe, sin período ni nota");
  pv = v({ monto: 20000 }, 70000);
  ok(pv.ok && pv.pago.monto === 20000, "pagar solo una parte");
  pv = v({ monto: "45000" }, 70000);
  ok(pv.ok && pv.pago.monto === 45000, "el monto llega como texto");
  pv = v({ monto: 70000.4 }, 70000);
  ok(pv.ok && pv.pago.monto === 70000, "redondea al guaraní");
  ok(v({ monto: 70001 }, 70000).ok === false, "no se puede pagar más de lo que se le debe");
  ok(v({ monto: 0 }, 70000).ok === false, "monto cero se rechaza");
  ok(v({ monto: -500 }, 70000).ok === false, "monto negativo se rechaza");
  ok(v({ monto: "abc" }, 70000).ok === false, "monto que no es número se rechaza");
  ok(v({}, 70000).ok === false, "sin monto se rechaza");
  ok(v(null, 70000).ok === false, "sin datos se rechaza");
  ok(v({ monto: 1000 }, 0).ok === false, "si no se le debe nada, no se paga");
  pv = v({ monto: 1000, desde: "2026-10-01", hasta: "2026-10-07" }, 5000);
  ok(pv.ok && pv.pago.desde === "2026-10-01" && pv.pago.hasta === "2026-10-07", "con período");
  pv = v({ monto: 1000, desde: "2026-10-07", hasta: "2026-10-07" }, 5000);
  ok(pv.ok, "un solo día");
  ok(v({ monto: 1000, desde: "2026-10-08", hasta: "2026-10-07" }, 5000).ok === false, "período al revés se rechaza");
  ok(v({ monto: 1000, desde: "2026-02-31" }, 5000).ok === false, "una fecha que no existe se rechaza");
  ok(v({ monto: 1000, hasta: "mañana" }, 5000).ok === false, "una fecha escrita mal se rechaza");
  pv = v({ monto: 1000, desde: "2026-10-01" }, 5000);
  ok(pv.ok && pv.pago.desde === "2026-10-01" && pv.pago.hasta === null, "solo «desde»");
  pv = v({ monto: 1000, desde: "  ", hasta: "" }, 5000);
  ok(pv.ok && pv.pago.desde === null && pv.pago.hasta === null, "fechas en blanco = sin período");
  pv = v({ monto: 1000, nota: "  quincena\n del 1 al 15  " }, 5000);
  ok(pv.ok && pv.pago.nota === "quincena del 1 al 15", "la nota se limpia (espacios y saltos)");
  pv = v({ monto: 1000, nota: "x".repeat(500) }, 5000);
  ok(pv.ok && pv.pago.nota.length === 200, "la nota se corta en 200");
  pv = v({ monto: 1000, nota: "   " }, 5000);
  ok(pv.ok && pv.pago.nota === null, "nota en blanco = sin nota");

  window.log("== Pago de comisiones: el período en palabras");
  igual(cm.textoDelPeriodo("2026-10-01", "2026-10-07"), "del 01/10/2026 al 07/10/2026", "con los dos extremos");
  igual(cm.textoDelPeriodo("2026-10-07", "2026-10-07"), "del 07/10/2026", "un solo día");
  igual(cm.textoDelPeriodo("2026-10-01", null), "desde el 01/10/2026", "solo desde");
  igual(cm.textoDelPeriodo(null, "2026-10-07"), "hasta el 07/10/2026", "solo hasta");
  igual(cm.textoDelPeriodo(null, null), "", "sin período");

  window.log("== Pago de comisiones: el evento de Seguridad");
  const seg = await C.cargar("src/lib/seguridad");
  ok(seg.esEventoDeSeguridad("pago_comisiones"), "pago_comisiones es un evento conocido");
  ok(seg.EVENTOS_DE_SEGURIDAD.some((e) => e.id === "pago_comisiones" && e.etiqueta === "Pago de comisiones"), "figura en la lista de Ajustes → Seguridad");
  const lim = seg.limpiarEventos(["descuentos", "pago_comisiones"]);
  ok(lim.ok && lim.eventos.join() === "descuentos,pago_comisiones", "se puede guardar tildado");
  ok(seg.pideClave(["pago_comisiones"], "pago_comisiones") && !seg.pideClave(["descuentos"], "pago_comisiones"), "pide clave solo si está tildado");
  ok(seg.puedeAutorizar("administrador", [], "pago_comisiones"), "el administrador siempre puede autorizarlo");
  ok(!seg.puedeAutorizar("caja", [], "pago_comisiones") && seg.puedeAutorizar("caja", ["pago_comisiones"], "pago_comisiones"), "caja, solo si se le tildó");

  // =============================================================== los saldos con una base de mentira
  window.log("== Pago de comisiones: ganado, pagado y pendiente por mozo");
  const sv = await C.cargar("src/lib/comision-mozo-servidor");
  const d = (s) => new Date(s + "T12:00:00Z");
  const cuentasBase = [
    // mozo A: tres cuentas cobradas (una con venta cancelada después)
    { mozoId: "A", ventaPosId: "v1", comisionMozoPorcentaje: 5, comisionMozoBase: 100000 }, // 5.000
    { mozoId: "A", ventaPosId: "v2", comisionMozoPorcentaje: 5, comisionMozoBase: 200000 }, // 10.000
    { mozoId: "A", ventaPosId: "v3", comisionMozoPorcentaje: 5, comisionMozoBase: 400000 }, // venta cancelada: no cuenta
    // mozo B: una cuenta cobrada
    { mozoId: "B", ventaPosId: "v4", comisionMozoPorcentaje: 10, comisionMozoBase: 33333 }, // 3.333
  ];
  const ventasBase = [
    { id: "v1", cancelada: false, creadoEn: d("2026-10-02") },
    { id: "v2", cancelada: false, creadoEn: d("2026-10-10") },
    { id: "v3", cancelada: true, creadoEn: d("2026-10-03") },
    { id: "v4", cancelada: false, creadoEn: d("2026-10-05") },
  ];
  const pagosBase = [
    { mozoId: "A", monto: 4000, createdAt: d("2026-10-06") },
    { mozoId: "A", monto: 1000, createdAt: d("2026-10-11") },
    { mozoId: "B", monto: 5000, createdAt: d("2026-10-06") }, // se le pagó de más: debe 0
  ];
  const consultas = [];
  const filtra = (filas, where) =>
    filas.filter((f) => (where.mozoId === undefined || f.mozoId === where.mozoId) && (!where.id || where.id.in.includes(f.id)));
  const dbFalsa = {
    cuentaMesa: { findMany: async ({ where }) => { consultas.push(where); return filtra(cuentasBase, where); } },
    ventaPos: { findMany: async ({ where }) => { consultas.push(where); return filtra(ventasBase, where); } },
    pagoComisionMozo: { findMany: async ({ where }) => { consultas.push(where); return filtra(pagosBase, where); } },
  };
  const todos = await sv.saldosDeComision(dbFalsa, "local-1");
  igual(todos.get("A").ganada, 15000, "A ganó 5.000 + 10.000 (la venta cancelada no suma)");
  igual(todos.get("A").pagada, 5000, "a A se le pagaron 4.000 + 1.000");
  igual(todos.get("A").pendiente, 10000, "a A se le deben 10.000");
  igual(todos.get("B").ganada, 3333, "B ganó 3.333");
  igual(todos.get("B").pendiente, 0, "a B se le pagó de más: debe 0, no negativo");
  ok(consultas.every((w) => w.storeId === "local-1"), "toda consulta lleva el local");

  const corto = await sv.saldosDeComision(dbFalsa, "local-1", { periodo: { gte: d("2026-10-01"), lt: d("2026-10-08") } });
  igual(corto.get("A").ganadaEnPeriodo, 5000, "del 1 al 7: A ganó 5.000 (la venta del 10 queda afuera)");
  igual(corto.get("A").pagadaEnPeriodo, 4000, "del 1 al 7: se le pagaron 4.000 (el pago del 11 queda afuera)");
  igual(corto.get("A").pendiente, 10000, "lo que se le debe no depende del período");

  const soloA = await sv.saldosDeComision(dbFalsa, "local-1", { mozoId: "A" });
  ok(soloA.has("A") && !soloA.has("B"), "con un mozo pedido, solo vuelve ese mozo");
  const sinNadie = await sv.saldosDeComision(dbFalsa, "local-1", { mozoId: "Z" });
  ok(sinNadie.size === 0, "un mozo sin movimiento no aparece (se le debe 0)");

  window.log("\naciertos: " + window.__aciertos + " · fallas: " + window.__fallas);
  window.__listo = true;
})().catch((e) => { document.getElementById("salida").textContent += "\nERROR: " + (e && e.stack || e); window.__listo = true; window.__fallas = (window.__fallas || 0) + 1; });
