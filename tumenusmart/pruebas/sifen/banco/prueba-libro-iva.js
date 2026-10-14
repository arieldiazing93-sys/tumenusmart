// Prueba del Libro IVA ventas, el Libro IVA compras y el Resumen del IVA del mes (src/lib/libro-iva.ts, la parte pura): que cada
// comprobante cierre al guaraní, que el IVA sea el de la fórmula del libro oficial (gravadas ÷ 11 y ÷ 21) y que el crédito fiscal
// no cuente lo que le falta el folio, el timbrado o el RUC.
(async () => {
  const { ok, igual } = window;
  const C = window.Cargador;

  const en = await C.cargar("src/lib/enteros");
  const li = await C.cargar("src/lib/libro-iva");

  // =============================================================== enteros que suman justo
  window.log("== Libro IVA: enteros que suman justo");
  igual(en.repartirEnEnteros([1.5, 1.5]).reduce((s, x) => s + x, 0), 3, "1,5 + 1,5 suman 3");
  igual(en.repartirEnEnteros([0.4, 0.4, 0.4]).reduce((s, x) => s + x, 0), 1, "0,4 × 3 = 1,2 → 1");
  igual(en.repartirEnEnteros([110000, 0, 0]), [110000, 0, 0], "un entero queda igual");

  // =============================================================== desglose
  window.log("== Libro IVA: desglose de un comprobante");
  let d = li.desgloseLibro(110000, 0, 0);
  igual(d, { total: 110000, exento: 0, gravado5: 0, iva5: 0, gravado10: 110000, iva10: 10000, sinIva: 100000 }, "110.000 al 10 %: IVA 10.000 y 100.000 sin IVA");
  d = li.desgloseLibro(0, 105000, 0);
  igual(d.iva5, 5000, "105.000 al 5 %: IVA 5.000 (÷ 21)");
  igual(d.sinIva, 100000, "y 100.000 sin IVA");
  d = li.desgloseLibro(66000, 21000, 3000);
  igual(d.total, 90000, "mezcla: total 90.000");
  igual([d.iva10, d.iva5, d.sinIva], [6000, 1000, 83000], "IVA 10 % 6.000, IVA 5 % 1.000, sin IVA 83.000");
  d = li.desgloseLibro(70000, 0, 0);
  igual(d.iva10, 6364, "70.000 ÷ 11 = 6.363,64 → 6.364 (al guaraní)");

  // =============================================================== montos de compra
  window.log("== Libro IVA compras: lo que dice la factura del proveedor");
  let m = li.montosDeCompra([{ subtotal: 100000, iva: "gravado10" }, { subtotal: 50000, iva: "gravado5" }, { subtotal: 20000, iva: "exento" }], 0);
  igual(m, [110000, 52500, 20000], "netos 100.000 al 10 %, 50.000 al 5 % y 20.000 exento → 110.000 + 52.500 + 20.000");
  m = li.montosDeCompra([{ subtotal: 100000, iva: "gravado10" }], 10);
  igual(m, [99000, 0, 0], "con un descuento general del 10 %: neto 90.000 → 99.000 con IVA");
  m = li.montosDeCompra([{ subtotal: 33333.33, iva: "gravado10" }, { subtotal: 1234.5, iva: "gravado5" }], 0);
  ok(m.every(Number.isInteger), "con decimales en los netos, los montos igual son enteros");
  igual(li.montosDeGasto(250000, "gravado10"), [250000, 0, 0], "un gasto de 250.000 al 10 %");
  igual(li.montosDeGasto(80000, "exento"), [0, 0, 80000], "un gasto exento");
  igual(li.montosDeGasto(105000, "gravado5"), [0, 105000, 0], "un gasto al 5 %");

  // =============================================================== filas del libro de ventas
  window.log("== Libro IVA ventas: filas");
  const fecha = new Date("2026-10-26T15:00:00Z");
  const base = { id: "f1", fecha, tipoIdentificacion: "ruc", identificacion: "80012345-0", razonSocial: "  Empresa SA  ", timbrado: "12345678", numero: "001-001-0000012", gravado10: 110000, gravado5: 0, exento: 0, modalidad: "autoimpresor", aCredito: false };
  let f = li.filaLibroVentas(base);
  ok(f.tipoIdentificacion === "RUC" && f.identificacion === "80012345-0" && f.razonSocial === "Empresa SA", "RUC con su nombre limpio");
  ok(f.total === 110000 && f.iva10 === 10000 && f.condicion === "contado" && f.modalidad === "autoimpresor", "importes, contado y modalidad");
  f = li.filaLibroVentas({ ...base, tipoIdentificacion: "sin_nombre", identificacion: "X", razonSocial: null, aCredito: true, modalidad: "electronico" });
  ok(f.identificacion === "44444401" && f.razonSocial === "Consumidor Final" && f.tipoIdentificacion === "Sin nombre", "«Sin Nombre» sale como Consumidor Final con el RUC 44444401 del modelo oficial");
  ok(f.condicion === "credito" && f.modalidad === "electronico", "a crédito y electrónica se conservan");
  f = li.filaLibroVentas({ ...base, tipoIdentificacion: "cedula", identificacion: "4987017" });
  igual(f.tipoIdentificacion, "Cédula de identidad", "cédula");
  f = li.filaLibroVentas({ ...base, tipoIdentificacion: null });
  igual(f.tipoIdentificacion, "RUC", "una factura vieja sin tipo es RUC");

  // =============================================================== filas del libro de compras
  window.log("== Libro IVA compras: filas y qué les falta");
  const compra = { id: "c1", origen: "compra", fecha, folio: "001-002-0000250", timbrado: "81225648", rucProveedor: "80000001", razonSocial: "Proveedor SA", aCredito: false, montos: [110000, 0, 0] };
  let c = li.filaLibroCompras(compra);
  ok(c.faltan.length === 0 && c.total === 110000 && c.iva10 === 10000, "compra completa");
  c = li.filaLibroCompras({ ...compra, folio: "250" });
  ok(c.faltan.length === 1 && c.faltan[0].includes("folio"), "folio mal escrito: falta el folio con su formato");
  c = li.filaLibroCompras({ ...compra, timbrado: "" });
  ok(c.faltan.length === 1 && c.faltan[0] === "el timbrado", "sin timbrado");
  c = li.filaLibroCompras({ ...compra, timbrado: "123456789" });
  ok(c.faltan.length === 1, "un timbrado de 9 dígitos no es válido");
  c = li.filaLibroCompras({ ...compra, rucProveedor: null, folio: null });
  ok(c.faltan.length === 2, "sin RUC y sin folio: faltan las dos cosas");
  c = li.filaLibroCompras({ ...compra, origen: "gasto", aCredito: true });
  ok(c.origen === "gasto" && c.condicion === "credito", "un gasto a crédito");

  // =============================================================== resumen
  window.log("== Resumen del IVA del mes");
  const ventas = [
    li.filaLibroVentas({ ...base, id: "v1", gravado10: 110000 }),
    li.filaLibroVentas({ ...base, id: "v2", gravado10: 0, gravado5: 21000 }),
    li.filaLibroVentas({ ...base, id: "v3", gravado10: 0, exento: 5000 }),
  ];
  const compras = [
    li.filaLibroCompras({ ...compra, id: "k1", montos: [55000, 0, 0] }),
    li.filaLibroCompras({ ...compra, id: "k2", montos: [0, 10500, 0] }),
    li.filaLibroCompras({ ...compra, id: "k3", montos: [220000, 0, 0], timbrado: null }),
  ];
  const r = li.resumirIva(ventas, compras, 2, 4);
  igual([r.ventas.iva10, r.ventas.iva5, r.debitoFiscal], [10000, 1000, 11000], "débito fiscal: 10.000 + 1.000");
  igual(r.ventas.total, 136000, "ventas 110.000 + 21.000 + 5.000");
  igual([r.compras.iva10, r.compras.iva5, r.creditoFiscal], [5000, 500, 5500], "crédito fiscal: solo las dos completas (5.000 + 500)");
  igual(r.comprasIncompletas.iva10, 20000, "la incompleta (IVA 20.000) no suma como crédito");
  igual(r.saldo, 5500, "saldo: 11.000 − 5.500 = 5.500 a pagar");
  igual([r.facturasAnuladas, r.comprasSinComprobante], [2, 4], "anuladas y sin comprobante se cuentan aparte");
  const aFavor = li.resumirIva([ventas[2]], compras.slice(0, 2), 0, 0);
  ok(aFavor.saldo < 0 && aFavor.saldo === -5500, "con más crédito que débito, el saldo es negativo (a favor)");

  // =============================================================== al azar: todo cierra al guaraní
  window.log("== Libro IVA: miles de comprobantes al azar");
  let semilla = 987654321;
  const azar = (n) => { semilla = (semilla * 1103515245 + 12345) % 2147483648; return semilla % n; };
  let mal = 0;
  for (let i = 0; i < 3000; i++) {
    const d2 = li.desgloseLibro(azar(5) === 0 ? 0 : azar(5000000) + azar(100) / 100, azar(3) === 0 ? 0 : azar(900000) + azar(100) / 100, azar(4) === 0 ? 0 : azar(300000));
    const suma = d2.gravado10 + d2.gravado5 + d2.exento;
    const enteros = [d2.total, d2.exento, d2.gravado5, d2.iva5, d2.gravado10, d2.iva10, d2.sinIva].every(Number.isInteger);
    if (!enteros || suma !== d2.total || d2.sinIva !== d2.total - d2.iva5 - d2.iva10 || d2.iva10 !== Math.round(d2.gravado10 / 11) || d2.iva5 !== Math.round(d2.gravado5 / 21)) mal++;
  }
  ok(mal === 0, `3000 comprobantes al azar: enteros, suma exacta y el IVA es gravadas ÷ 11 y ÷ 21 (${mal} con problemas)`);

  // =============================================================== fechas y secciones
  window.log("== Libro IVA: fechas y secciones");
  igual(li.fechaDelLibro(new Date("2026-10-26T00:00:00Z"), "UTC"), "26/10/2026", "una compra (día guardado en UTC) sale con su día");
  igual(li.fechaDelLibro(new Date("2026-10-26T15:00:00Z"), "America/Asuncion"), "26/10/2026", "una factura de la tarde sale con el día de Asunción");
  igual(li.fechaDelLibro(new Date("2026-10-26T02:00:00Z"), "America/Asuncion"), "25/10/2026", "y una de la madrugada UTC es todavía el día anterior en Asunción");
  igual(li.leerReporteContable("libro-ventas"), "libro-ventas", "libro-ventas es un reporte");
  igual(li.leerReporteContable("rg90"), "rg90", "rg90 es un reporte");
  igual(li.leerReporteContable("otro"), null, "otro no");
  igual(li.REPORTES_CONTABLES.length, 4, "son cuatro reportes en Contabilidad");

  window.log("\naciertos: " + window.__aciertos + " · fallas: " + window.__fallas);
  window.__listo = true;
})().catch((e) => { document.getElementById("salida").textContent += "\nERROR: " + (e && e.stack || e); window.__listo = true; window.__fallas = (window.__fallas || 0) + 1; });
