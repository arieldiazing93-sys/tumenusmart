// Un pedido del menú digital «para retirar» pasa por una cuenta del Servicio delivery, pero es un RETIRO. Con las funciones REALES:
// la venta que sale de cobrarla se guarda como «llevar» (las estadísticas lo cuentan como «Retiro en el local») con la nota «Retiro · Cuenta N»,
// el Historial lo lista como Retiro, y los reportes de promociones y de cancelaciones lo siguen poniendo en el canal «delivery»
// (entró por el Servicio delivery) aunque el tipo de la venta ya no sea «delivery».
(async () => {
  const C = window.Cargador; const S = C.simulacros; const { ok, igual } = window;

  // ------------------------------------------------------------------------------------------ simulacros
  let db = null;
  S["src/lib/prisma-local"] = { prismaDelLocal: () => db };
  S["src/lib/promociones-servidor"] = { cargarPromociones: async () => [] };

  const D = await C.cargar("src/lib/delivery");
  const CC = await C.cargar("src/lib/cuentas-canceladas");
  const RC = await C.cargar("src/lib/reporte-cancelaciones-servidor");
  const RP = await C.cargar("src/lib/reporte-promociones-servidor");

  // ============================================================================================== qué se anota en la venta
  window.log("== La venta de una cuenta de delivery");
  igual(D.datosDeVentaDeCuentaDelivery("retiro", "0009"), { tipoEntrega: "llevar", nota: "Retiro · Cuenta 0009" }, "un pedido para retirar: la venta es «llevar» y dice «Retiro · Cuenta 0009»");
  igual(D.datosDeVentaDeCuentaDelivery("delivery", "0008"), { tipoEntrega: "delivery", nota: "Delivery · Cuenta 0008" }, "un pedido con envío sigue siendo delivery");
  for (const raro of [null, undefined, "", "mesa", "RETIRO", "otra-cosa"]) {
    ok(D.datosDeVentaDeCuentaDelivery(raro, "0001").tipoEntrega === "delivery", "una cuenta abierta a mano (sin pedido del menú) o con un valor raro («" + raro + "») sigue siendo delivery");
  }
  ok(D.esNotaDeCuentaDelivery("Delivery · Cuenta 0008") && D.esNotaDeCuentaDelivery("Retiro · Cuenta 0009"), "el Historial reconoce las dos notas como «cuenta de delivery»");
  ok(!D.esNotaDeCuentaDelivery("Mesa 5 · Cuenta #0004") && !D.esNotaDeCuentaDelivery(null) && !D.esNotaDeCuentaDelivery("") && !D.esNotaDeCuentaDelivery("Retiro"), "y no confunde una cuenta de mesa, un vacío ni una palabra suelta");
  ok(D.presenciaDeFacturaDeDelivery("retiro") === "presencial" && D.presenciaDeFacturaDeDelivery("delivery") === "domicilio" && D.presenciaDeFacturaDeDelivery(null) === "domicilio", "la factura de un retiro sale «presencial»; la del delivery y la de una cuenta abierta a mano, «domicilio»");

  // ============================================================================================== el Historial: cuentas canceladas sin cobrar
  window.log("== Historial: cuentas canceladas");
  const ahora = new Date("2026-10-19T15:00:00Z");
  const cuenta = (id, numero, cliente) => ({ id, numero, clienteNombre: cliente, costoEnvio: 0, cerradaEn: ahora, cerradaPor: "Caja", motivoCierre: "No vino", descuentoTipo: null, descuentoValor: null, items: [{ cantidad: 1, precioUnitario: 50000, estado: "activo", anuladoEn: null }] });
  let consultasPedido = [];
  db = {
    cuentaMesa: { findMany: async () => [] },
    cuentaDelivery: { findMany: async () => [cuenta("c-retiro", 9, "Ariel"), cuenta("c-envio", 8, "Beto")] },
    pedidoWeb: { findMany: async (args) => { consultasPedido.push(args); return [{ cuentaDeliveryId: "c-retiro" }].filter((p) => args.where.cuentaDeliveryId.in.includes(p.cuentaDeliveryId) && args.where.tipoEntrega === "retiro"); } },
  };
  const canceladas = await CC.cargarCuentasCanceladas(db, { gte: new Date("2026-10-19T03:00:00Z"), lt: new Date("2026-10-20T03:00:00Z") });
  const titulos = Object.fromEntries(canceladas.map((c) => [c.numero, c.titulo]));
  ok(titulos[9] === "Retiro · Ariel" && titulos[8] === "Delivery · Beto", "una cuenta cancelada de un pedido para retirar se lista como «Retiro · Ariel»; la de envío, «Delivery · Beto» → " + JSON.stringify(titulos));
  ok(canceladas.every((c) => c.canal === "delivery" && /^Cuenta de delivery/.test(c.etiqueta)), "las dos siguen siendo cuentas del Servicio delivery (el canal no cambia)");
  ok(consultasPedido.length === 1 && consultasPedido[0].where.cuentaDeliveryId.in.length === 2, "se pregunta por los pedidos de todas las cuentas de una sola vez");
  db.cuentaDelivery.findMany = async () => []; consultasPedido = [];
  igual(await CC.cargarCuentasCanceladas(db, { gte: ahora, lt: ahora }), [], "sin cuentas canceladas no se consulta nada de más");
  ok(consultasPedido.length === 0, "…ni los pedidos del menú");

  // ============================================================================================== reporte de cancelaciones: canal de las ventas anuladas
  window.log("== Reporte de cancelaciones: el canal");
  const venta = (id, numero, tipoEntrega) => ({ id, numero, total: 50000, tipoEntrega, canceladaEn: ahora, canceladaPor: "Caja", motivoCancelacion: "Error" });
  db = {
    cuentaMesa: { findMany: async (a) => (a.where.estado === "anulada" ? [] : [{ ventaPosId: "v-mesa", mesa: "5" }]) },
    cuentaDelivery: { findMany: async (a) => (a.where.estado === "anulada" ? [] : [{ ventaPosId: "v-retiro" }, { ventaPosId: "v-envio" }]) },
    ventaPos: { findMany: async () => [venta("v-retiro", 1, "llevar"), venta("v-envio", 2, "delivery"), venta("v-mostrador", 3, "llevar"), venta("v-local", 4, "local"), venta("v-mesa", 5, "local")] },
  };
  const filas = await RC.cargarRegistros("L1", { gte: new Date("2026-10-19T03:00:00Z"), lt: new Date("2026-10-20T03:00:00Z") }, "cuentas");
  const canalDe = (n) => filas.find((f) => f.id === "vp-" + n)?.canal;
  ok(canalDe("v-retiro") === "delivery", "una venta de RETIRO que cobró una cuenta de delivery se anula en el canal «delivery» → " + canalDe("v-retiro"));
  ok(canalDe("v-envio") === "delivery" && canalDe("v-mostrador") === "mostrador" && canalDe("v-local") === "mostrador" && canalDe("v-mesa") === "comedor", "las demás siguen igual: delivery, mostrador (para llevar o en el local) y comedor");

  // ============================================================================================== reporte de promociones: canal de cada línea
  window.log("== Reporte de promociones: el canal");
  const item = (ventaPosId, tipoEntrega) => ({ ventaPosId, promocionId: "p1", productId: "x", nombreProducto: "Pizza", cantidad: 1, precioUnitario: 40000, precioAntesPromo: 50000, cortesia: false, costoProducto: null, costoAgregados: null, ventaPos: { tipoEntrega } });
  db = {
    ventaPosItem: { findMany: async () => [item("v-retiro", "llevar"), item("v-envio", "delivery"), item("v-mostrador", "llevar"), item("v-mesa", "local")] },
    cuentaMesa: { findMany: async () => [{ ventaPosId: "v-mesa" }] },
    cuentaDelivery: { findMany: async () => [{ ventaPosId: "v-retiro" }, { ventaPosId: "v-envio" }] },
  };
  const rep = await RP.calcularReportePromociones("L1", { gte: ahora, lt: ahora });
  const ventasDe = (canal) => rep.canales.find((c) => c.canal === canal).ventas;
  ok(ventasDe("delivery") === 2 && ventasDe("comedor") === 1 && ventasDe("mostrador") === 1, "el retiro cobrado en una cuenta de delivery cuenta como delivery: delivery 2, comedor 1, mostrador 1 → " + JSON.stringify(rep.canales.map((c) => [c.canal, c.ventas])));

  window.log("\naciertos: " + window.__aciertos + " · fallas: " + window.__fallas);
  window.__listo = true;
})().catch((e) => { document.getElementById("salida").textContent += "\nERROR: " + (e && e.stack || e); window.__listo = true; window.__fallas = (window.__fallas || 0) + 1; });
