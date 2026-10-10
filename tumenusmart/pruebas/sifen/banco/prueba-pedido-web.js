// Prueba de los pedidos del menú digital: lo que llega del navegador se revisa sin confiar en nada (src/lib/pedido-web.ts) y todo el
// recorrido del servidor (src/lib/pedido-web-servidor.ts): recibir el pedido, aceptarlo, rechazarlo, quitar un producto, corregir los
// datos, marcarlo listo y sincronizarlo con la cuenta del delivery. La base de datos es en memoria; el catálogo, el horario y la carga
// de productos a la cuenta se simulan (tienen sus propias pruebas): el resto es el código real.
(async () => {
  const { ok, igual } = window;
  const C = window.Cargador;
  const S = C.simulacros;
  const forge = window.forge;
  const BF = window.BaseFalsa;

  // =============================================================== la parte pura: lo que llega del navegador
  window.log("== Pedido web: lo que llega del navegador se revisa");
  const pw = await C.cargar("src/lib/pedido-web");
  const base = (extra = {}) => ({
    envioId: "envio-0001-abcd", nombre: "  Juan   Pérez ", telefono: "0981 234-567", tipoEntrega: "delivery", direccion: "Casa verde",
    clienteLat: -25.285, clienteLng: -57.635, metodoPago: "efectivo", comprobanteTipo: "ticket", items: [{ productId: "p-pizza", cantidad: 2 }],
    totalMostrado: 200000, ...extra,
  });
  let r = pw.normalizarPedidoPublico(base());
  ok(r.ok && r.datos.nombre === "Juan Pérez" && r.datos.telefono === "0981234567" && r.datos.tipoEntrega === "delivery" && r.datos.factura === null && r.datos.totalMostrado === 200000, "un pedido bien armado se acepta, con el nombre y el teléfono limpios");
  r = pw.normalizarPedidoPublico(base({ tipoEntrega: "retiro", clienteLat: null, clienteLng: null, direccion: "ignorada" }));
  ok(r.ok && r.datos.direccion === null && r.datos.clienteLat === null, "retiro: no pide ubicación y no guarda dirección");
  const rechazo = (extra, campo, texto) => {
    const x = pw.normalizarPedidoPublico(base(extra));
    ok(!x.ok && (campo ? x.campo === campo : true) && (texto ? x.error.includes(texto) : true), `se rechaza ${JSON.stringify(extra).slice(0, 80)}${x.ok ? " (pasó)" : ": " + x.error}`);
  };
  rechazo({ envioId: "x" }, undefined, "identificar el envío");
  rechazo({ envioId: "con espacios y ñ" }, undefined, "identificar el envío");
  rechazo({ nombre: "A" }, "nombre");
  rechazo({ nombre: "   " }, "nombre");
  rechazo({ telefono: "12" }, "telefono");
  rechazo({ telefono: "abc" }, "telefono");
  rechazo({ tipoEntrega: "drone" }, "entrega");
  rechazo({ clienteLat: null, clienteLng: null }, "ubicacion");
  rechazo({ clienteLat: 95, clienteLng: -57 }, "ubicacion");
  rechazo({ clienteLat: "x", clienteLng: -57 }, "ubicacion");
  rechazo({ metodoPago: "bitcoin" }, "pago");
  rechazo({ items: [] }, "carrito");
  rechazo({ items: "no" }, "carrito");
  rechazo({ items: Array.from({ length: 41 }, () => ({ productId: "p1", cantidad: 1 })) }, "carrito", "demasiados");
  rechazo({ items: [{ productId: "p1", cantidad: 0 }] }, "carrito", "cantidad");
  rechazo({ items: [{ productId: "p1", cantidad: 51 }] }, "carrito", "cantidad");
  rechazo({ items: [{ productId: "p1", cantidad: 1.5 }] }, "carrito", "cantidad");
  rechazo({ items: [{ cantidad: 1 }] }, "carrito");
  rechazo({ items: [{ productId: "no es un id válido!", cantidad: 1 }] }, "carrito");
  rechazo({ items: [{ productId: "p1", cantidad: 1, opcionIds: ["a b"] }] }, "carrito");
  rechazo({ items: [{ mitadYMitad: { productIdA: "a" }, cantidad: 1 }] }, "carrito");
  r = pw.normalizarPedidoPublico(base({ items: [{ mitadYMitad: { productIdA: "pa", productIdB: "pb" }, opcionIds: ["o1"], ingredientesQuitados: ["cebolla", ""], cantidad: 1 }] }));
  ok(r.ok && r.datos.items[0].mitadYMitad.productIdB === "pb" && r.datos.items[0].productId === undefined && r.datos.items[0].ingredientesQuitados.join() === "cebolla", "un mitad y mitad con agregados y sin un ingrediente se acepta");
  r = pw.normalizarPedidoPublico(base({ nombre: "Ana\u0000\nLópez​ ", notas: "x".repeat(500) }));
  ok(r.ok && r.datos.nombre === "Ana López" && r.datos.notas.length === 300, "caracteres de control e invisibles salen del nombre y las aclaraciones se recortan a 300");
  r = pw.normalizarPedidoPublico(base({ comprobanteTipo: "factura", facturaRuc: "80069563-1", facturaRazonSocial: "Cliente de Prueba S.A.", facturaEmail: "c@correo.com" }));
  ok(r.ok && r.datos.comprobanteTipo === "factura" && r.datos.factura.numeroIdentificacion === "80069563-1" && r.datos.factura.razonSocial === "Cliente de Prueba S.A.", "factura con RUC y razón social correctos");
  rechazo({ comprobanteTipo: "factura", facturaRuc: "80069563-2", facturaRazonSocial: "Cliente SA" }, "factura", "dígito verificador es 1");
  rechazo({ comprobanteTipo: "factura", facturaRuc: "", facturaRazonSocial: "Cliente SA" }, "factura");
  rechazo({ comprobanteTipo: "factura", facturaRuc: "80069563-1", facturaRazonSocial: "AB" }, "factura");
  rechazo({ comprobanteTipo: "factura", facturaRuc: "80069563-1", facturaRazonSocial: "Cliente SA", facturaEmail: "no-es-correo" }, "factura");

  window.log("== Pedido web: nombres de cada paso y recorrido del estado");
  igual([pw.etiquetasPersonal("gastronomia", "delivery").preparando, pw.etiquetasPersonal("gastronomia", "delivery").accionListo, pw.etiquetasPersonal("gastronomia", "delivery").accionEntregado], ["En preparación", "Listo", "Entregado y cobrado"], "gastronomía: preparación → listo → entregado y cobrado");
  igual([pw.etiquetasPersonal("distribuidora", "delivery").preparando, pw.etiquetasPersonal("distribuidora", "delivery").accionListo, pw.etiquetasPersonal("distribuidora", "delivery").accionEntregado], ["Armando el pedido", "Listo para despachar", "Despachado y cobrado"], "distribuidora: armando → listo para despachar → despachado y cobrado");
  igual([pw.etiquetasPersonal("tienda", "retiro").accionListo, pw.etiquetasPersonal("tienda", "retiro").accionEntregado], ["Listo para retirar", "Retirado y cobrado"], "tienda con retiro: listo para retirar → retirado y cobrado");
  ok(pw.textoParaCliente("gastronomia", "retiro", "listo").detalle.includes("retirarlo") && pw.textoParaCliente("gastronomia", "delivery", "aceptado").detalle.includes("sale hacia"), "el cliente lee algo distinto si retira o si se lo llevan");
  igual(pw.pasosDeSeguimiento("gastronomia", "delivery", "aceptado").actual, 1, "el seguimiento marca el paso 2 en preparación");
  igual(pw.pasosDeSeguimiento("gastronomia", "delivery", "rechazado").actual, -1, "un pedido rechazado no está en la línea");
  ok(pw.puedePasar("nuevo", "aceptado") && pw.puedePasar("nuevo", "rechazado") && pw.puedePasar("aceptado", "listo") && pw.puedePasar("listo", "entregado"), "los pasos permitidos");
  ok(!pw.puedePasar("nuevo", "entregado") && !pw.puedePasar("rechazado", "aceptado") && !pw.puedePasar("entregado", "nuevo") && !pw.puedePasar("listo", "aceptado"), "y los que no: no se salta ni se vuelve atrás");
  igual(pw.normalizarRubro("cualquier cosa"), "gastronomia", "un rubro desconocido cae en gastronomía");
  const existencias = new Map([
    ["i-queso", { nombre: "Queso", unidad: "kilogramo", stock: 0.4, controlado: true }],
    ["i-sin", { nombre: "Salsa", unidad: "litro", stock: 0, controlado: false }],
  ]);
  const avisos = pw.avisosDeStock([{ insumoId: "i-queso", cantidad: 0.6 }, { insumoId: "i-sin", cantidad: 5 }, { insumoId: "i-queso", cantidad: 0.1 }], existencias);
  ok(avisos.length === 1 && avisos[0].includes("Queso") && avisos[0].includes("0.3"), "avisa del stock justo (suma lo de varias líneas) y no de un insumo cuyo stock no se lleva: " + JSON.stringify(avisos));

  // =============================================================== el servidor, con una base en memoria
  window.log("== Pedido web: el servidor (recibir, aceptar, rechazar, corregir)");
  S["next/navigation"] = { notFound() { throw new Error("404"); }, redirect() { throw new Error("redirect"); } };
  S["crypto"] = {
    randomBytes: (n) => {
      const bytes = forge.random.getBytesSync(n);
      return { toString: (enc) => { const b64 = forge.util.encode64(bytes); return enc === "base64url" ? b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") : b64; } };
    },
    createHash: () => { const md = forge.md.sha256.create(); const o = { update(x) { md.update(String(x), "utf8"); return o; }, digest() { return md.digest().toHex(); } }; return o; },
  };
  S["@prisma/client"] = { Prisma: { PrismaClientKnownRequestError: class extends Error { constructor(m, o) { super(m); this.code = o && o.code; } } } };

  const storeId = "local-1";
  const catalogo = [
    { id: "p-pizza", nombre: "Pizza muzzarella", precio: 55000, disponible: true, ingredientes: [], mitadYMitadGrupo: null, mitadYMitadModo: "mayor", iva: "gravado10", opciones: [], costo: 20000, receta: [{ insumoId: "i-queso", cantidad: 0.3 }], almacenId: null },
    { id: "p-gaseosa", nombre: "Gaseosa 2 L", precio: 12000, disponible: true, ingredientes: [], mitadYMitadGrupo: null, mitadYMitadModo: "mayor", iva: "gravado10", opciones: [], costo: 6000, receta: [], almacenId: null },
    { id: "p-agotado", nombre: "Tiramisú", precio: 9000, disponible: false, ingredientes: [], mitadYMitadGrupo: null, mitadYMitadModo: "mayor", iva: "gravado10", opciones: [], costo: null, receta: [], almacenId: null },
  ];
  let abierto = true;
  const rondas = [];
  let rondaFalla = null;
  S["src/lib/catalogo-pedido"] = { cargarCatalogoParaPedido: async () => catalogo };
  S["src/lib/promociones-servidor"] = { cargarPromociones: async () => [] };
  S["src/lib/estado-tienda"] = {
    obtenerEstadoTienda: async () => ({ aceptaPedidos: abierto, abierto, pausado: false, proximaApertura: null, mensajePausa: null, horarioDeHoy: "", tieneHorarios: true }),
    motivoSinPedidos: (e) => (e.aceptaPedidos ? null : "Estamos cerrados en este momento. Abrimos mañana a las 11:00."),
  };
  S["src/lib/delivery-servidor"] = {
    guardarRondaDelivery: async (d) => {
      rondas.push(d);
      if (rondaFalla) return { ok: false, error: rondaFalla };
      return { ok: true, cuentaId: d.cuentaId, cuentaNumero: 1, ronda: 1, totalEnvio: 0, areas: ["Cocina"], yaEnviado: false };
    },
  };

  BF.reiniciar();
  const alcance = await C.cargar("src/lib/alcance-local");
  BF.instalar(S, (id) => new Proxy({}, { get: (_, nombre) => new Proxy({}, { get: (__, op) => (args) => BF.db[nombre][op](alcance.aplicarLocal(nombre[0].toUpperCase() + nombre.slice(1), op, args, id)) }) }));
  S["src/lib/prisma-local"].upsertClienteFiscal = async () => ({});
  // La base con transacciones: el cuerpo corre contra la misma base (sin deshacer nada, como las demás pruebas).
  S["src/lib/prisma"].prisma = new Proxy(BF.db, { get: (t, k) => (k === "$transaction" ? (fn) => fn(BF.db) : t[k]) });

  const servidor = await C.cargar("src/lib/pedido-web-servidor");
  const T = () => BF.tablas;
  const local = (extra = {}) => ({
    id: storeId, slug: "lafogata", nombre: "La Fogata", estado: "activo", vencimiento: null, pedidosWebActivo: true, pedidosWebAutoAceptar: false, pedidosWebRubro: "gastronomia",
    aceptaDelivery: true, aceptaRetiro: true, aceptaEfectivo: true, aceptaTransferencia: true, aceptaTarjetaDebito: true, aceptaTarjetaCredito: true,
    envioModo: "zonas", lat: -25.28, lng: -57.63, ...extra,
  });
  const sembrar = () => {
    BF.reiniciar();
    abierto = true; rondas.length = 0; rondaFalla = null;
    T().store = [{ id: storeId, ...local(), contadorPedidosWeb: 0, contadorCuentasDelivery: 0, contadorClientes: 0 }, { id: "local-2", slug: "otro", contadorPedidosWeb: 0, contadorCuentasDelivery: 0 }];
    T().deliveryZone = [
      { id: "z1", storeId, nombre: "Centro", radioKm: 3, costoEnvio: 8000, activo: true },
      { id: "z2", storeId, nombre: "Alrededores", radioKm: 8, costoEnvio: 15000, activo: true },
    ];
    T().insumo = [{ id: "i-queso", storeId, nombre: "Queso", unidadMedida: "kilogramo", stockActual: 0.4 }];
    T().movimientoStock = [{ id: "m1", storeId, insumoId: "i-queso", tipo: "compra", cantidad: 0.4 }];
  };
  let envioN = 0;
  const datos = (extra = {}) => {
    const x = pw.normalizarPedidoPublico(base({ envioId: "envio-" + String(++envioN).padStart(6, "0") + "-xyz", telefono: "0981" + String(envioN).padStart(6, "0"), ...extra }));
    if (!x.ok) throw new Error("fixture inválido: " + x.error);
    return x.datos;
  };
  const crear = (extra = {}, ctx = { ipHash: "ip-1" }, loc = local()) => servidor.crearPedidoWeb(loc, datos(extra), ctx);
  const quien = { nombre: "Ana", email: "ana@local.com", rol: "empleado" };

  // ---- recibir
  sembrar();
  let c = await crear({ items: [{ productId: "p-pizza", cantidad: 1 }, { productId: "p-gaseosa", cantidad: 2 }], totalMostrado: 87000 });
  ok(c.ok && c.estado === "nuevo" && c.numero === 1 && c.total === 55000 + 24000 + 8000 && !c.yaEnviado && c.token.length >= 30, "un pedido delivery entra: total = productos + envío de la zona (" + JSON.stringify(c).slice(0, 120) + ")");
  let fila = T().pedidoWeb[0];
  ok(fila.zonaNombre === "Centro" && Number(fila.costoEnvio) === 8000 && fila.envioACoordinar === false && fila.subtotal === 79000 && fila.estado === "nuevo" && fila.items.length === 2 && fila.lineas[0].nombre === "Pizza muzzarella", "queda guardado con su zona, su envío y lo pedido");
  ok(T().store[0].contadorPedidosWeb === 1 && T().bitacora.some((b) => b.accion === "pedido_web_recibido"), "el correlativo avanzó y quedó en la bitácora");
  const env = T().pedidoWeb[0].envioId;
  let repetido = await servidor.crearPedidoWeb(local(), { ...datos(), envioId: env }, { ipHash: "ip-1" });
  ok(repetido.ok && repetido.yaEnviado && repetido.token === c.token && T().pedidoWeb.length === 1, "el mismo envío repetido no duplica el pedido: devuelve el mismo enlace");

  c = await crear({ tipoEntrega: "retiro", clienteLat: null, clienteLng: null });
  fila = T().pedidoWeb[1];
  ok(c.ok && fila.tipoEntrega === "retiro" && Number(fila.costoEnvio) === 0 && fila.zonaNombre === null && c.total === 110000, "retiro: sin envío ni zona");
  c = await crear({ clienteLat: -25.33, clienteLng: -57.63 });
  ok(c.ok && T().pedidoWeb[2].zonaNombre === "Alrededores" && Number(T().pedidoWeb[2].costoEnvio) === 15000, "más lejos: otra zona, otro precio");
  c = await crear({ clienteLat: -26.5, clienteLng: -57.63 });
  ok(c.ok && T().pedidoWeb[3].envioACoordinar === true && Number(T().pedidoWeb[3].costoEnvio) === 0 && T().pedidoWeb[3].zonaNombre === "A coordinar", "fuera de toda zona: el envío queda «a coordinar»");

  // ---- lo que se rechaza (y cada rechazo no deja nada guardado)
  const antes = T().pedidoWeb.length;
  const rechaza = async (nombre, extra, loc, esperado) => {
    const x = await crear(extra, { ipHash: "ip-" + nombre }, loc);
    ok(!x.ok && (!esperado || x.error.includes(esperado)), `${nombre}: se rechaza${x.ok ? " (pasó)" : " con «" + x.error.slice(0, 70) + "»"}`);
  };
  await rechaza("local apagado", {}, local({ pedidosWebActivo: false }), "todavía no recibe");
  await rechaza("local suspendido", {}, local({ estado: "suspendido" }), "no está recibiendo");
  abierto = false;
  await rechaza("cerrado", {}, local(), "cerrados");
  abierto = true;
  await rechaza("sin delivery", {}, local({ aceptaDelivery: false }), "no hace delivery");
  await rechaza("sin retiro", { tipoEntrega: "retiro", clienteLat: null, clienteLng: null }, local({ aceptaRetiro: false }), "retiro");
  await rechaza("pago no habilitado", { metodoPago: "transferencia" }, local({ aceptaTransferencia: false }), "método de pago");
  await rechaza("producto agotado", { items: [{ productId: "p-agotado", cantidad: 1 }] }, local(), "");
  await rechaza("producto que no existe", { items: [{ productId: "p-fantasma", cantidad: 1 }] }, local(), "");
  await rechaza("precio cambió", { totalMostrado: 50000 }, local(), "precios cambiaron");
  ok(T().pedidoWeb.length === antes, "ningún pedido rechazado dejó nada guardado");
  c = await crear({ clienteLat: -26.5, clienteLng: -57.63, totalMostrado: 50000 });
  ok(c.ok, "con el envío «a coordinar» no se compara el total (todavía no se sabe)");

  // ---- tope contra el abuso
  sembrar();
  for (let i = 0; i < 3; i++) ok((await crear({ telefono: "0981555000" }, { ipHash: "ip-a" + i })).ok, `pedido ${i + 1} del mismo teléfono`);
  let tope = await crear({ telefono: "0981555000" }, { ipHash: "ip-z" });
  ok(!tope.ok && tope.error.includes("varios pedidos seguidos"), "el 4.º pedido del mismo teléfono en pocos minutos se frena");
  sembrar();
  for (let i = 0; i < 6; i++) ok((await crear({ telefono: "09815550" + String(10 + i) }, { ipHash: "mismo" })).ok, `pedido ${i + 1} del mismo dispositivo`);
  tope = await crear({ telefono: "0981555099" }, { ipHash: "mismo" });
  ok(!tope.ok && tope.error.includes("varios pedidos seguidos"), "el 7.º del mismo dispositivo también");
  ok((await crear({ telefono: "0981555098" }, { ipHash: "otro" })).ok, "otro dispositivo sigue pudiendo pedir");

  // ---- avisos de stock
  sembrar();
  c = await crear({ items: [{ productId: "p-pizza", cantidad: 2 }] });
  ok(c.ok && T().pedidoWeb[0].avisos.length === 1 && T().pedidoWeb[0].avisos[0].includes("Queso"), "se avisa que el queso no alcanza (hay 0,4 y el pedido usa 0,6)");

  // ---- aceptar
  window.log("== Pedido web: aceptar, rechazar, quitar un producto, corregir");
  sembrar();
  c = await crear({ comprobanteTipo: "factura", facturaRuc: "80069563-1", facturaRazonSocial: "Cliente de Prueba S.A.", notas: "sin cebolla" });
  const id1 = T().pedidoWeb[0].id;
  let a = await servidor.aceptarPedidoWeb(storeId, id1, quien);
  ok(a.ok && a.cuentaNumero === 1, "aceptar abre la cuenta y carga los productos");
  fila = T().pedidoWeb[0];
  const cuenta = T().cuentaDelivery[0];
  ok(fila.estado === "aceptado" && fila.cuentaDeliveryId === cuenta.id && fila.aceptadoPor === "Ana", "el pedido queda aceptado y enlazado a su cuenta");
  ok(cuenta.clienteNombre === "Juan Pérez" && cuenta.facturaRuc === "80069563-1" && cuenta.facturaRazonSocial === "Cliente de Prueba S.A." && Number(cuenta.costoEnvio) === 8000 && cuenta.zonaNombre === "Centro", "la cuenta lleva el cliente, los datos de factura y el envío");
  ok(cuenta.direccion.includes("Casa verde") && cuenta.direccion.includes("google.com/maps") && cuenta.clienteLat === -25.285 && cuenta.notas.includes("Pedido web #0001") && cuenta.notas.includes("sin cebolla"), "la dirección lleva la referencia y el enlace del mapa, y las notas la aclaración del cliente");
  ok(rondas.length === 1 && rondas[0].envioId === fila.envioId && rondas[0].items.length === 1 && rondas[0].items[0].productId === "p-pizza" && rondas[0].storeId === storeId, "los productos se cargan con el identificador del envío (un reintento no los duplica)");
  ok(T().customer.length === 1 && T().bitacora.some((b) => b.accion === "pedido_web_aceptado"), "queda el cliente y la bitácora");
  a = await servidor.aceptarPedidoWeb(storeId, id1, quien);
  ok(!a.ok && a.error.includes("ya lo atendió") && T().cuentaDelivery.length === 1 && rondas.length === 1, "aceptar dos veces no abre otra cuenta");

  // retiro: la cuenta se arma sin dirección ni envío
  c = await crear({ tipoEntrega: "retiro", clienteLat: null, clienteLng: null });
  a = await servidor.aceptarPedidoWeb(storeId, T().pedidoWeb[1].id, quien);
  const cuentaRetiro = T().cuentaDelivery[1];
  ok(a.ok && cuentaRetiro.direccion === "Retiro en el local" && cuentaRetiro.zonaNombre === "Retiro en el local" && Number(cuentaRetiro.costoEnvio) === 0 && cuentaRetiro.clienteLat === null, "retiro: la cuenta dice «Retiro en el local», sin envío");

  // envío a coordinar: hay que poner el costo
  c = await crear({ clienteLat: -26.5, clienteLng: -57.63 });
  const idCoord = T().pedidoWeb[2].id;
  a = await servidor.aceptarPedidoWeb(storeId, idCoord, quien);
  ok(!a.ok && a.error.includes("costo de envío") && T().pedidoWeb[2].estado === "nuevo", "con envío a coordinar no se acepta sin el costo");
  a = await servidor.aceptarPedidoWeb(storeId, idCoord, quien, { costoEnvio: 20000 });
  ok(a.ok && Number(T().cuentaDelivery[2].costoEnvio) === 20000 && T().pedidoWeb[2].estado === "aceptado", "con el costo puesto, se acepta con ese envío");

  // si la carga de productos falla, todo vuelve atrás
  c = await crear({});
  const idFalla = T().pedidoWeb[3].id;
  rondaFalla = "El producto Pizza muzzarella ya no está disponible.";
  a = await servidor.aceptarPedidoWeb(storeId, idFalla, quien);
  ok(!a.ok && T().pedidoWeb[3].estado === "nuevo" && T().cuentaDelivery[3].estado === "cancelada" && T().pedidoWeb[3].avisos[0].includes("ya no está disponible"), "si no se pueden cargar los productos: el pedido vuelve a nuevo (con el motivo) y la cuenta a medio armar se cancela");
  rondaFalla = null;
  a = await servidor.aceptarPedidoWeb(storeId, idFalla, quien);
  ok(a.ok, "y se puede volver a aceptar cuando se arregla");

  // ---- aceptar solo
  sembrar();
  c = await crear({}, { ipHash: "ip-1" }, local({ pedidosWebAutoAceptar: true }));
  ok(c.ok && c.estado === "aceptado" && T().pedidoWeb[0].estado === "aceptado" && T().pedidoWeb[0].aceptadoPor === "Automático" && T().cuentaDelivery.length === 1, "con «aceptar solos»: entra y ya está aceptado (cuenta y comanda)");
  c = await crear({ clienteLat: -26.5, clienteLng: -57.63 }, { ipHash: "ip-1" }, local({ pedidosWebAutoAceptar: true }));
  ok(c.ok && c.estado === "nuevo" && T().pedidoWeb[1].estado === "nuevo", "pero si el envío es «a coordinar» queda esperando a una persona");

  // ---- rechazar
  sembrar();
  await crear({});
  const idR = T().pedidoWeb[0].id;
  let x = await servidor.rechazarPedidoWeb(storeId, idR, "ab", quien);
  ok(!x.ok && x.error.includes("motivo"), "rechazar pide un motivo");
  x = await servidor.rechazarPedidoWeb(storeId, idR, "Sin stock", quien);
  ok(x.ok && T().pedidoWeb[0].estado === "rechazado" && T().pedidoWeb[0].motivoRechazo === "Sin stock" && T().pedidoWeb[0].resueltoPor === "Ana", "rechazado con su motivo, para que el cliente lo lea");
  x = await servidor.rechazarPedidoWeb(storeId, idR, "Otra vez", quien);
  ok(!x.ok, "un pedido ya resuelto no se rechaza de nuevo");
  a = await servidor.aceptarPedidoWeb(storeId, idR, quien);
  ok(!a.ok && (T().cuentaDelivery || []).length === 0, "ni se acepta uno rechazado");

  // ---- quitar un producto («no hay»)
  sembrar();
  await crear({ items: [{ productId: "p-pizza", cantidad: 1 }, { productId: "p-gaseosa", cantidad: 2 }] });
  const idQ = T().pedidoWeb[0].id;
  x = await servidor.quitarLineaPedidoWeb(storeId, idQ, 1, quien);
  fila = T().pedidoWeb[0];
  ok(x.ok && fila.items.length === 1 && fila.lineas.length === 1 && fila.subtotal === 55000 && Number(fila.total) === 55000 + 8000, "quitar la gaseosa recalcula el total (productos + envío)");
  x = await servidor.quitarLineaPedidoWeb(storeId, idQ, 0, quien);
  ok(!x.ok && x.error.includes("único producto"), "el último producto no se quita: se rechaza el pedido");
  x = await servidor.quitarLineaPedidoWeb(storeId, idQ, 7, quien);
  ok(!x.ok, "una posición que no existe se rechaza");

  // ---- corregir datos (el RUC mal tipeado)
  sembrar();
  await crear({ comprobanteTipo: "factura", facturaRuc: "80069563-1", facturaRazonSocial: "Cliente SA" });
  const idE = T().pedidoWeb[0].id;
  const corr = (extra) => servidor.editarDatosPedidoWeb(storeId, idE, { clienteNombre: "Juan Pérez", clienteTelefono: "0981234567", comprobanteTipo: "factura", facturaTipoIdentificacion: "ruc", facturaRuc: "80069563-1", facturaRazonSocial: "Cliente SA", ...extra }, quien);
  x = await corr({ facturaRuc: "80069563-9" });
  ok(!x.ok && x.error.includes("dígito verificador") && T().pedidoWeb[0].facturaRuc === "80069563-1", "un RUC con el dígito mal no se guarda");
  x = await corr({ facturaRuc: "4987017-3", facturaRazonSocial: "Juan Pérez" });
  ok(x.ok && T().pedidoWeb[0].facturaRuc === "4987017-3" && T().pedidoWeb[0].facturaRazonSocial === "Juan Pérez", "el RUC corregido se guarda");
  x = await corr({ comprobanteTipo: "ticket" });
  ok(x.ok && T().pedidoWeb[0].comprobanteTipo === "ticket" && T().pedidoWeb[0].facturaRuc === null, "pasar a ticket borra los datos de factura");
  x = await corr({ clienteNombre: "A" });
  ok(!x.ok, "el nombre muy corto se rechaza");
  await crear({ clienteLat: -26.5, clienteLng: -57.63 });
  const idCo = T().pedidoWeb[1].id;
  x = await servidor.editarDatosPedidoWeb(storeId, idCo, { clienteNombre: "Juan Pérez", clienteTelefono: "0981234567", comprobanteTipo: "ticket", costoEnvio: 12000 }, quien);
  ok(x.ok && Number(T().pedidoWeb[1].costoEnvio) === 12000 && T().pedidoWeb[1].envioACoordinar === false && Number(T().pedidoWeb[1].total) === T().pedidoWeb[1].subtotal + 12000, "fijar el envío «a coordinar» desde la corrección");
  await servidor.aceptarPedidoWeb(storeId, idE, quien);
  x = await corr({ clienteNombre: "Otro nombre" });
  ok(!x.ok && x.error.includes("pedido nuevo"), "un pedido ya aceptado no se corrige acá (se corrige en su cuenta)");

  // ---- listo y sincronización con la cuenta del delivery
  sembrar();
  await crear({});
  const idL = T().pedidoWeb[0].id;
  x = await servidor.marcarListoPedidoWeb(storeId, idL, quien);
  ok(!x.ok, "un pedido nuevo no se marca listo");
  await servidor.aceptarPedidoWeb(storeId, idL, quien);
  x = await servidor.marcarListoPedidoWeb(storeId, idL, quien);
  ok(x.ok && T().pedidoWeb[0].estado === "listo" && T().pedidoWeb[0].listoEn, "aceptado → listo");
  T().cuentaDelivery[0].estado = "pagada";
  T().cuentaDelivery[0].cerradaEn = new Date();
  await servidor.sincronizarPedidosConCuentas(storeId);
  ok(T().pedidoWeb[0].estado === "entregado" && T().pedidoWeb[0].entregadoEn, "si la cuenta se cobra desde el delivery, el pedido queda entregado");
  await crear({});
  await servidor.aceptarPedidoWeb(storeId, T().pedidoWeb[1].id, quien);
  T().cuentaDelivery[1].estado = "cancelada";
  await servidor.sincronizarPedidosConCuentas(storeId);
  ok(T().pedidoWeb[1].estado === "cancelado", "si la cuenta se cancela desde el delivery, el pedido queda cancelado");

  // ---- cada local ve solo lo suyo
  sembrar();
  T().pedidoWeb = [{ id: "ajeno", storeId: "local-2", numero: 1, estado: "nuevo", token: "t".repeat(30), envioId: "envio-ajeno-1", tipoEntrega: "retiro", clienteNombre: "Ajeno", clienteTelefono: "0981000000", costoEnvio: 0, items: [{ productId: "p-pizza", cantidad: 1 }], lineas: [], subtotal: 1, total: 1, avisos: [], comprobanteTipo: "ticket", metodoPago: "efectivo", cuentaDeliveryId: null }];
  a = await servidor.aceptarPedidoWeb(storeId, "ajeno", quien);
  ok(!a.ok && a.error.includes("No encontré") && T().pedidoWeb[0].estado === "nuevo", "un pedido de OTRO local no se puede aceptar");
  x = await servidor.rechazarPedidoWeb(storeId, "ajeno", "Sin stock", quien);
  ok(!x.ok && T().pedidoWeb[0].estado === "nuevo", "ni rechazar");
  x = await servidor.quitarLineaPedidoWeb(storeId, "ajeno", 0, quien);
  ok(!x.ok, "ni quitarle productos");

  window.log("\naciertos: " + window.__aciertos + " · fallas: " + window.__fallas);
  window.__listo = true;
})().catch((e) => { document.getElementById("salida").textContent += "\nERROR: " + (e && e.stack || e); window.__listo = true; window.__fallas = (window.__fallas || 0) + 1; });
