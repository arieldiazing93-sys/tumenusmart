// La estación (caja) en el Historial de cuentas: el filtro y la columna «Estación» del Excel con la ruta REAL. Con más de una caja, cada cuenta
// dice de cuál estación fue y se puede filtrar por ella; con una sola caja la planilla queda como siempre (sin columna de más).
(async () => {
  const C = window.Cargador; const S = C.simulacros; const { ok, igual } = window;

  // ------------------------------------------------------------------------------------------ el «local» de mentira
  let estaciones, ventas, filasHoja, formatos, canceladas, consultaVentas;
  const reiniciar = (cantidadDeEstaciones) => {
    estaciones = [{ id: "e1", nombre: "Caja 1" }, { id: "e2", nombre: "Caja 2" }].slice(0, cantidadDeEstaciones);
    filasHoja = []; formatos = []; consultaVentas = null;
    canceladas = [{ canal: "mesa", id: "m1", titulo: "Mesa 5", etiqueta: "Cuenta de mesa #0007", cerradaEn: new Date("2026-10-18T15:00:00Z"), cerradaPor: "Ana", responsable: "Beto", rolResponsable: "Mozo", motivoCierre: "Se fueron", unoPorUno: false, total: 80000 }];
    ventas = [
      { numero: 1, total: 100000, formaPago: "efectivo", pagos: [{ forma: "efectivo", monto: 100000 }], registradoPor: "María", creadoEn: new Date("2026-10-18T13:00:00Z"), cancelada: false, personal: null, turnoPos: { estacion: { nombre: "Caja 1" } }, _estacionId: "e1" },
      { numero: 2, total: 50000, formaPago: "tarjeta_debito", pagos: [{ forma: "tarjeta_debito", monto: 50000 }], registradoPor: "Juan", creadoEn: new Date("2026-10-18T14:00:00Z"), cancelada: false, personal: null, turnoPos: { estacion: { nombre: "Caja 2" } }, _estacionId: "e2" },
    ];
  };
  const fila = { getCell: (i) => ({ set numFmt(v) { formatos.push([i, v]); } }) };
  const db = {
    estacion: { findMany: async () => estaciones.map((e) => ({ ...e })) },
    ventaPos: { findMany: async ({ where }) => { consultaVentas = where; const e = where.turnoPos?.estacionId; return ventas.filter((v) => !e || v._estacionId === e); } },
  };
  S["next/server"] = { NextRequest: class {}, NextResponse: { json: (c, o) => ({ cuerpo: c, ...o }) } };
  S["src/lib/auth"] = { negarSiNoPuede: async () => null };
  S["src/lib/prisma-local"] = { prismaDelLocal: () => db };
  S["src/lib/local-actual"] = { idLocalActual: async () => "L1", localActual: async () => ({ nombre: "Mi local" }) };
  S["src/lib/cuentas-canceladas"] = { cargarCuentasCanceladas: async () => canceladas };
  S["src/lib/agenda-personal"] = { nombreCompleto: (p) => `${p.nombre} ${p.apellido ?? ""}`.trim() };
  S["src/lib/excel-reporte"] = {
    nuevoLibro: () => ({ libro: {}, hoja: { columns: [], addRow: (v) => { filasHoja.push(v); return fila; } } }),
    filaTitulo: (_h, v) => { filasHoja.push(v); return fila; },
    respuestaXlsx: async () => ({ ok: true }),
  };

  const Exportar = await C.cargar("src/app/admin/(protected)/pos/cuentas/exportar/route");
  const pedir = async (consulta) => { filasHoja = []; formatos = []; await Exportar.GET({ url: "http://x/admin/pos/cuentas/exportar?fecha=hoy" + consulta }); };
  const buscar = (texto) => filasHoja.find((f) => f[0] === texto || f.includes(texto));
  const encabezado = () => filasHoja.find((f) => f[0] === "Cuenta");
  const ventaNum = (n) => filasHoja.find((f) => f[0] === n);

  // ------------------------------------------------------------------------------------------ las dos funciones de ayuda
  window.log("== El filtro y la lista de estaciones");
  const L = await C.cargar("src/lib/estacion-filtro");
  igual(L.filtroPorEstacion(undefined), {}, "sin estación elegida no filtra");
  igual(L.filtroPorEstacion(""), {}, "una estación vacía tampoco");
  igual(L.filtroPorEstacion("e2"), { turnoPos: { estacionId: "e2" } }, "con una estación filtra por el turno de caja");
  reiniciar(2);
  let r = await L.cargarEstacionesParaFiltro(db, "e2");
  ok(r.varias === true && r.elegida?.id === "e2" && r.estaciones.length === 2, "con dos cajas: hay varias y se reconoce la elegida");
  r = await L.cargarEstacionesParaFiltro(db, "otra-de-otro-local");
  ok(r.elegida === null, "un id que no es de este local no elige nada (no filtra ni deja ver otro local)");
  r = await L.cargarEstacionesParaFiltro(db, undefined);
  ok(r.elegida === null && r.varias === true, "sin elegir: todas");
  reiniciar(1);
  r = await L.cargarEstacionesParaFiltro(db, "e1");
  ok(r.varias === false, "con una sola caja no hay «varias»: la columna y el filtro no se muestran");

  // ------------------------------------------------------------------------------------------ el Excel con dos cajas
  window.log("== Excel con dos cajas");
  reiniciar(2); await pedir("");
  igual(encabezado(), ["Cuenta", "Fecha", "Hora", "Forma de pago", "Cajero", "Estación", "Personal", "Estado", "Total (Gs.)", "Motivo"], "la columna «Estación» queda después del cajero");
  let v1 = ventaNum(1), v2 = ventaNum(2);
  ok(v1 && v1[4] === "María" && v1[5] === "Caja 1" && v1[8] === 100000, "la venta 1 dice Caja 1 y su total sigue en la columna del total → " + JSON.stringify(v1));
  ok(v2 && v2[4] === "Juan" && v2[5] === "Caja 2" && v2[8] === 50000, "la venta 2 dice Caja 2 → " + JSON.stringify(v2));
  const cancelada = filasHoja.find((f) => typeof f[0] === "string" && f[0].startsWith("Mesa 5"));
  ok(cancelada && cancelada[5] === "—" && cancelada[8] === 80000, "una cuenta de mesa cancelada sin cobrar no pasó por ninguna caja: «—» → " + JSON.stringify(cancelada));
  const total = filasHoja.find((f) => typeof f[7] === "string" && f[7].startsWith("TOTAL GENERAL"));
  ok(total && total[8] === 150000, "el total general (150.000) queda en la columna del total → " + JSON.stringify(total));
  ok(formatos.length >= 3 && formatos.every(([i]) => i === 9), "el formato de miles se aplica a la columna 9 (la del total) en todas las filas → " + JSON.stringify(formatos));
  ok(filasHoja.every((f) => f.length === 0 || f.length === 2 || f.length === 10 || f.length === 1), "todas las filas con datos tienen 10 columnas");

  window.log("== Excel filtrado por una caja");
  reiniciar(2); await pedir("&estacion=e2");
  ok(consultaVentas?.turnoPos?.estacionId === "e2", "la consulta de ventas filtra por el turno de esa estación");
  ok(ventaNum(1) === undefined && ventaNum(2)?.[5] === "Caja 2", "solo sale la venta de Caja 2");
  ok(!filasHoja.some((f) => typeof f[0] === "string" && f[0].startsWith("Mesa 5")), "las cuentas canceladas sin cobrar no entran (no pasaron por una caja)");
  igual(buscar("Estación")?.slice(0, 2), ["Estación", "Caja 2"], "el encabezado del reporte dice de qué estación es");
  const t2 = filasHoja.find((f) => typeof f[7] === "string" && f[7].startsWith("TOTAL GENERAL"));
  ok(t2 && t2[8] === 50000, "y el total es solo el de esa caja (50.000) → " + JSON.stringify(t2));
  reiniciar(2); await pedir("&estacion=inventada");
  ok(consultaVentas?.turnoPos === undefined && ventaNum(1) && ventaNum(2), "una estación que no existe no filtra nada: sale todo");

  // ------------------------------------------------------------------------------------------ el Excel con una sola caja
  window.log("== Excel con una sola caja");
  reiniciar(1); ventas = ventas.filter((v) => v._estacionId === "e1"); await pedir("");
  igual(encabezado(), ["Cuenta", "Fecha", "Hora", "Forma de pago", "Cajero", "Personal", "Estado", "Total (Gs.)", "Motivo"], "sin columna de más: la planilla queda como siempre");
  v1 = ventaNum(1);
  ok(v1 && v1.length === 9 && v1[7] === 100000, "la venta tiene 9 columnas y el total en la 8.ª");
  ok(formatos.every(([i]) => i === 8), "el formato de miles sigue en la columna 8");

  window.log("\naciertos: " + window.__aciertos + " · fallas: " + window.__fallas);
  window.__listo = true;
})().catch((e) => { document.getElementById("salida").textContent += "\nERROR: " + (e && e.stack || e); window.__listo = true; window.__fallas = (window.__fallas || 0) + 1; });
