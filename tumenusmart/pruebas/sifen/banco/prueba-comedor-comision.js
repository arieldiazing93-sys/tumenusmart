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

  window.log("\naciertos: " + window.__aciertos + " · fallas: " + window.__fallas);
  window.__listo = true;
})().catch((e) => { document.getElementById("salida").textContent += "\nERROR: " + (e && e.stack || e); window.__listo = true; window.__fallas = (window.__fallas || 0) + 1; });
