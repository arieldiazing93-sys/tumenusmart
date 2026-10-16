// Prueba de la alerta de existencias de los insumos (src/lib/alerta-stock.ts) y del filtro «Stock bajo» del reporte
// (src/lib/reporte-insumos.ts): una sola regla para el puntito de la lista, la etiqueta de la ficha y la columna «Estado» del Excel/PDF.
(async () => {
  const { ok, igual } = window;
  const S = window.Cargador.simulacros;
  const a = await window.Cargador.cargar("src/lib/alerta-stock");

  window.log("== Alerta de stock: la regla");
  igual(a.estadoDeStock(-1, 5), "negativo", "bajo cero es negativo, aunque tenga mínimo");
  igual(a.estadoDeStock(-0.001, null), "negativo", "bajo cero es negativo también sin mínimo");
  igual(a.estadoDeStock(3, 5), "bajo", "3 con mínimo 5: bajo el mínimo");
  igual(a.estadoDeStock(4.999, 5), "bajo", "4,999 con mínimo 5: bajo el mínimo");
  igual(a.estadoDeStock(5, 5), "ok", "justo en el mínimo todavía no avisa (estrictamente menos)");
  igual(a.estadoDeStock(10, 5), "ok", "por encima del mínimo: bien");
  igual(a.estadoDeStock(0, null), "ok", "sin mínimo, en cero no es negativo ni bajo");
  igual(a.estadoDeStock(1, undefined), "ok", "sin mínimo nunca está «bajo»");
  igual(a.estadoDeStock(0, 0), "ok", "mínimo cero y stock cero: no avisa");
  igual(a.estadoDeStock(-5, 5, true), "ok", "una preparación (salsa, masa…) no lleva stock propio: nunca avisa");
  igual(a.estadoDeStock(1, 5, true), "ok", "una preparación bajo su «mínimo» tampoco");
  ok(a.tieneAlertaDeStock("negativo") && a.tieneAlertaDeStock("bajo") && !a.tieneAlertaDeStock("ok"), "negativo y bajo traen alerta; ok no");

  window.log("== Reporte de insumos: el filtro «solo stock bajo»");
  const cat = (nombre) => ({ nombre });
  const ins = (id, nombre, categoria, stockMinimo, costoUnitario) => ({
    id, nombre, categoria: categoria ? cat(categoria) : null, categoriaId: categoria ? "c-" + categoria : null, unidadMedida: "kg", activo: true,
    stockMinimo, costoUnitario, esElaborado: false,
  });
  const insumos = [
    ins("a", "Azúcar", "Almacén", 5, 1000),      // stock 3  → bajo
    ins("b", "Bacon", "Carnes", 2, 20000),       // stock -2 → negativo
    ins("c", "Carne molida", "Carnes", 5, 30000), // stock 10 → ok
    ins("d", "Detergente", null, null, 500),     // stock 1, sin mínimo → ok
    ins("e", "Especias", "Almacén", 1, null),    // stock 1, igual al mínimo → ok
  ];
  // El stock sale del movimiento: inicial + compras + ventas… (un solo almacén por insumo, salvo el azúcar que está en dos).
  const mov = (insumoId, almacenId, inicial, ventas = 0) => ({ insumoId, almacenId, inicial, compras: 0, ventas, ajustes: 0, anulaciones: 0, movimientos: 0 });
  const acumulados = [mov("a", "x", 2), mov("a", "y", 1), mov("b", "x", 0, -2), mov("c", "x", 10), mov("d", "x", 1), mov("e", "x", 1)];
  const redondear3 = (n) => Math.round(n * 1000) / 1000;
  S["src/lib/prisma-local"] = {
    prismaDelLocal: () => ({
      insumo: { findMany: async () => insumos },
      almacen: { findMany: async () => [{ id: "x", nombre: "Depósito" }, { id: "y", nombre: "Cocina" }] },
      categoriaInsumo: { findUnique: async () => null },
    }),
  };
  S["src/lib/reporte-almacen"] = { acumularMovimientos: async () => acumulados, redondear3, SIN_CATEGORIA_INSUMO: "sin" };
  const { calcularReporteInsumos } = await window.Cargador.cargar("src/lib/reporte-insumos");
  const rango = { desde: "2026-10-01", hasta: "2026-10-16" };

  const todo = await calcularReporteInsumos("local1", rango, null);
  ok(todo.soloBajo === false, "sin filtro: soloBajo = false");
  igual(todo.filas.map((f) => f.insumo), ["Azúcar", "Especias", "Bacon", "Carne molida", "Detergente"], "sin filtro salen los 5 (por categoría y nombre; «Sin categoría» al final)");
  igual(Object.fromEntries(todo.filas.map((f) => [f.insumo, f.estado])), { "Azúcar": "bajo", "Especias": "ok", "Bacon": "negativo", "Carne molida": "ok", "Detergente": "ok" }, "la columna Estado de cada uno");
  ok(todo.porAlmacen.length === 6, "«Por almacén» trae un renglón por insumo y almacén: " + todo.porAlmacen.length);

  const bajos = await calcularReporteInsumos("local1", rango, null, true);
  ok(bajos.soloBajo === true, "con filtro: soloBajo = true");
  igual(bajos.filas.map((f) => f.insumo), ["Azúcar", "Bacon"], "con el filtro quedan SOLO el bajo y el negativo");
  igual(bajos.filas.map((f) => f.estado), ["bajo", "negativo"], "y cada uno con su estado");
  ok(bajos.filas.every((f) => f.estado !== "ok"), "ninguna fila ok se cuela");
  igual(bajos.porAlmacen.map((f) => f.insumo + "@" + f.almacen), ["Azúcar@Cocina", "Azúcar@Depósito", "Bacon@Depósito"], "«Por almacén» también deja solo esos (el azúcar en sus dos almacenes)");
  igual(bajos.totalValor, 3 * 1000 + -2 * 20000, "el valor total es el de los insumos que quedaron: " + bajos.totalValor);
  ok(bajos.sinCosto === 0, "sin costo se cuenta sobre lo que quedó");

  window.log("\naciertos: " + window.__aciertos + " · fallas: " + window.__fallas);
  window.__listo = true;
})().catch((e) => { document.getElementById("salida").textContent += "\nERROR: " + (e && e.stack || e); window.__listo = true; window.__fallas = (window.__fallas || 0) + 1; });
