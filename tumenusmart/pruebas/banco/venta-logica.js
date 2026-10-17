// El cobro del mostrador (registrarVenta) y el cierre de turno (cerrarTurno) con las acciones REALES del servidor y una base en memoria.
// Casos concretos + miles de carritos al azar: lo cobrado, el IVA, la factura, el stock y los pagos tienen que cerrar al guaraní.
(async () => {
  const C = window.Cargador; const S = C.simulacros; const { ok, igual } = window;

  // ------------------------------------------------------------------------------------------ el estado del «local»
  const ahora = Date.now();
  let turnoEstado = "abierto"; let tienda; let punto; let correlativo = 0; let numeroVenta = 0;
  let ventas = [], comprobantes = [], movimientos = [], bitacoras = [], fiscales = [], insumos = new Map();
  let tiposDescuento; let promociones = []; let turnos = new Map();
  const reiniciar = () => {
    tienda = { facturaObligatoria: false, ventasACredito: true, pedirPersonalEnVenta: false };
    punto = { id: "pe1", activo: true, timbradoHasta: new Date(ahora + 365 * 86400000), timbradoDesde: new Date(ahora - 365 * 86400000), establecimiento: "001", puntoExpedicion: "001",
      numeroTimbrado: "12345678", razonSocialEmisor: "Mi Local S.A.", rucEmisor: "80012345-6", modalidad: "autoimpresor" };
    correlativo = 0; numeroVenta = 0; turnoEstado = "abierto"; ventas = []; comprobantes = []; movimientos = []; bitacoras = []; fiscales = []; promociones = [];
    insumos = new Map([["harina", { stockActual: 1000 }], ["queso", { stockActual: 1000 }]]);
    tiposDescuento = [{ id: "t20", nombre: "Tarjeta", porcentaje: 20 }, { id: "t100", nombre: "Cortesía", porcentaje: 100 }];
  };
  const rec = (insumoId, cantidad) => ({ insumoId, cantidad, insumo: { costoUnitario: 1000 } });
  const prod = (id, nombre, precio, iva, extra = {}) => ({ id, nombre, precio, iva, promociones: [], disponible: true, ingredientes: [], mitadYMitadGrupo: null, mitadYMitadModo: "mayor",
    areaImpresionId: null, almacenId: null, costo: null, unidadMedida: "unidad", esServicio: false, opciones: [], receta: [], gruposAgregados: [], category: { activa: true }, ...extra });
  const productos = [
    prod("pizza", "Pizza", 50000, "gravado10", { receta: [rec("harina", 0.3)], opciones: [{ id: "queso", nombre: "Queso extra", tipo: "agregado", precioExtra: 5000, costo: 1000 }] }),
    prod("cerveza", "Cerveza", 12000, "gravado10"),
    prod("pan", "Pan", 6000, "gravado5"),
    prod("agua", "Agua", 3000, "exento"),
    prod("agotado", "Agotado", 9000, "gravado10", { disponible: false }),
    prod("oculto", "Oculto", 9000, "gravado10", { category: { activa: false } }),
    prod("quesoKilo", "Queso por kilo", 80000, "gravado10", { unidadMedida: "kilogramo" }),
  ];

  let cierres = []; let turnoSeCierraAlGuardar = false;
  const db = {
    turnoPos: {
      findUnique: async () => ({ id: "t1", estado: turnoEstado, estacion: { puntoExpedicion: punto } }),
      // El cierre condicionado: solo cierra si sigue abierto (como la base real con `where: { estado: "abierto" }`).
      updateMany: async ({ where, data }) => { if (turnoEstado !== where.estado) return { count: 0 }; turnoEstado = data.estado; cierres.push(data); return { count: 1 }; },
    },
    ventaPos: { findMany: async ({ where }) => ventas.filter((v) => !v.cancelada).map((v) => ({ total: v.total, formaPago: v.formaPago, pagos: v.pagos.create.map((p) => ({ forma: p.forma, monto: p.monto })) })) },
    product: { findMany: async ({ where }) => productos.filter((p) => p.category.activa || (where.OR && true === false)) },
    miembroPersonal: { count: async () => 0 },
  };
  const tx = {
    // Dentro de la transacción: ¿sigue abierto el turno? (`turnoSeCierraAlGuardar` imita que otra persona lo cerró justo antes de guardar)
    turnoPos: { findFirst: async ({ where }) => (!turnoSeCierraAlGuardar && turnoEstado === where.estado ? { id: where.id } : null) },
    puntoExpedicion: { update: async () => ({ ultimoNumeroFactura: ++correlativo }) },
    ventaPos: { create: async ({ data }) => { const v = { id: "v" + (ventas.length + 1), ...data }; ventas.push(v); return { id: v.id }; } },
    insumo: { update: async ({ where, data }) => { const i = insumos.get(where.id); if (data.stockActual?.decrement != null) i.stockActual -= data.stockActual.decrement; if (data.stockActual?.increment != null) i.stockActual += data.stockActual.increment; return i; } },
    movimientoStock: { createMany: async ({ data }) => { movimientos.push(...data); } },
    almacen: { findFirst: async () => ({ id: "alm1" }) },
    emisorFiscal: { findUnique: async () => null },
    comprobante: { create: async ({ data }) => { comprobantes.push(data); return { id: "c" + comprobantes.length, numero: data.numero }; } },
    $transaction: async (cb) => cb(tx),
  };
  S["src/lib/auth"] = { exigirPermiso: async () => ({ nombre: "Caja", email: "caja@x.com", rol: "caja" }) };
  S["src/lib/local-actual"] = { idLocalActual: async () => "L1" };
  S["src/lib/prisma"] = { prisma: { store: { findUnique: async () => tienda }, customer: { upsert: async () => ({}) }, $transaction: async (cb) => cb(tx) } };
  S["src/lib/prisma-local"] = { prismaDelLocal: () => db, siguienteNumeroVentaPos: async () => ++numeroVenta, upsertClienteFiscal: async (_t, _s, d) => { fiscales.push(d); } };
  S["@prisma/client"] = { Prisma: {} };
  S["src/lib/bitacora"] = { registrarBitacora: async (_l, _s, d) => { bitacoras.push(d); } };
  S["src/lib/cargar-elaborados"] = { cargarElaborados: async () => new Map() };
  S["src/lib/sifen/servidor"] = { ErrorFacturaElectronica: class extends Error {}, problemaParaEmitirElectronico: async () => null, firmarDocumentoAlVender: async () => {} };
  S["src/lib/sifen/solicitudes"] = { solicitarCancelacion: async () => {} };
  S["src/lib/seguridad-servidor"] = { exigirAutorizacion: async () => ({ ok: true }) };
  S["src/lib/tipos-descuento-servidor"] = { cargarTiposDescuento: async () => tiposDescuento };
  S["src/lib/promociones-servidor"] = { cargarPromociones: async () => promociones };
  S["src/app/admin/(protected)/pos/turno-actual"] = { turnoAbierto: async () => null, pedidosDelTurno: async () => [], netoMovimientosCaja: async () => ({ ingresos: 0, retiros: 0, neto: 0 }) };
  S["next/cache"] = { revalidatePath() {} };

  const A = await C.cargar("src/app/admin/(protected)/pos/actions");

  const base = (extra = {}) => ({ pagos: [{ forma: "efectivo", monto: 0 }], tipoEntrega: "local", clienteNombre: "", clienteTelefono: "", nota: "", items: [{ productId: "cerveza", cantidad: 1 }], comprobanteTipo: "ticket", ...extra });
  const vender = (extra) => A.registrarVenta("t1", base(extra));
  const ultima = () => ventas[ventas.length - 1];

  // ============================================================================================== casos concretos
  window.log("== Una venta simple");
  reiniciar();
  let r = await vender({ items: [{ productId: "pizza", cantidad: 2, opcionIds: ["queso"] }] });
  ok(r.ok === true && r.total === 110000, "2 pizzas con queso extra (55.000 c/u) = 110.000 → " + JSON.stringify(r.ok ? r.total : r.error));
  ok(ultima().total === 110000 && ultima().formaPago === "efectivo" && ultima().pagos.create[0].monto === 110000, "queda guardada por 110.000, efectivo, con el pago completo");
  ok(Math.abs(insumos.get("harina").stockActual - (1000 - 0.6)) < 1e-9 && movimientos.length === 1 && movimientos[0].tipo === "venta", "el stock baja 0,6 de harina (2 × 0,3) con su movimiento");
  ok(ultima().items.create[0].precioUnitario === 55000 && ultima().items.create[0].precioAgregados === 5000, "el precio y el de los agregados salen del servidor");

  window.log("== Factura con IVA mixto y descuento");
  reiniciar();
  r = await vender({ comprobanteTipo: "factura", facturaTipoIdentificacion: "sin_nombre", descuento: { tipo: "porcentaje", valor: 0, tipoDescuentoId: "t20" },
    items: [{ productId: "pizza", cantidad: 1 }, { productId: "pan", cantidad: 3 }, { productId: "agua", cantidad: 2 }] });
  ok(r.ok === true && r.total === 59200, "74.000 con 20 % (tipo «Tarjeta») = 59.200 → " + JSON.stringify(r.ok ? r.total : r.error));
  let v = ultima();
  ok(v.descuento === 14800 && v.descuentoConcepto === "Tarjeta", "el descuento (14.800) y su concepto quedan anotados");
  ok(Math.abs(v.facturaGravado10 + v.facturaGravado5 + v.facturaExento - 59200) < 0.005, "gravado 10 + gravado 5 + exento suman EXACTO lo cobrado (" + (v.facturaGravado10 + v.facturaGravado5 + v.facturaExento) + ")");
  ok(v.facturaIva10 === Math.round(v.facturaGravado10 / 11) && v.facturaIva5 === Math.round(v.facturaGravado5 / 21), "el IVA es el gravado ÷ 11 y ÷ 21, en guaraníes enteros");
  ok(v.facturaNumero === "001-001-0000001" && comprobantes[0].numero === v.facturaNumero && comprobantes[0].total === 59200, "factura 001-001-0000001 y su comprobante dice lo mismo (total 59.200)");
  ok(comprobantes[0].items.create.reduce((s, i) => s + i.total, 0) === 59200 && comprobantes[0].items.create.reduce((s, i) => s + i.descuento, 0) === 14800, "las líneas del comprobante suman 59.200 y su descuento suma 14.800");
  ok(comprobantes[0].gravado10 === v.facturaGravado10 && comprobantes[0].iva10 === v.facturaIva10 && comprobantes[0].iva5 === v.facturaIva5 && comprobantes[0].exento === v.facturaExento, "la venta y el comprobante coinciden en cada tasa");
  await vender({ comprobanteTipo: "factura", facturaTipoIdentificacion: "sin_nombre" });
  ok(ultima().facturaNumero === "001-001-0000002", "la siguiente factura toma el número 2");

  window.log("== Pago dividido");
  reiniciar();
  r = await vender({ items: [{ productId: "cerveza", cantidad: 5 }], pagos: [{ forma: "efectivo", monto: 40000 }, { forma: "tarjeta_debito", monto: 20000 }] });
  ok(r.ok === true && ultima().formaPago === "mixto" && ultima().pagos.create.length === 2, "60.000 = 40.000 efectivo + 20.000 débito → queda «mixto» con sus dos pagos");
  r = await vender({ items: [{ productId: "cerveza", cantidad: 5 }], pagos: [{ forma: "efectivo", monto: 40000 }, { forma: "tarjeta_debito", monto: 19999 }] });
  ok(r.ok === false && /suman/.test(r.error), "si los pagos no suman el total (59.999 vs 60.000) se rechaza → " + (r.ok ? "" : r.error));
  r = await vender({ pagos: [] }); ok(r.ok === false, "sin ninguna forma de pago se rechaza");
  r = await vender({ pagos: [{ forma: "bitcoin", monto: 1 }] }); ok(r.ok === false, "una forma de pago inventada se rechaza");
  r = await vender({ pagos: [{ forma: "efectivo", monto: 1 }, { forma: "a_credito", monto: 11999 }] }); ok(r.ok === false, "a crédito no se combina con otra forma");
  r = await vender({ items: [{ productId: "cerveza", cantidad: 1 }], pagos: [{ forma: "efectivo", monto: 1 }] });
  ok(r.ok === true && ultima().pagos.create[0].monto === 12000, "con UNA forma, el monto que mande el navegador se ignora: cobra todo (12.000)");

  window.log("== A crédito");
  reiniciar();
  r = await vender({ pagos: [{ forma: "a_credito", monto: 0 }] }); ok(r.ok === false && /nombre/.test(r.error), "sin cliente se rechaza");
  r = await vender({ pagos: [{ forma: "a_credito", monto: 0 }], clienteNombre: "Ana", clienteTelefono: "0981 123 456", creditoDias: 15 });
  ok(r.ok === true && ultima().formaPago === "a_credito" && ultima().fechaVencimientoCredito instanceof Date, "con nombre y teléfono se carga, con su vencimiento");
  const diasVence = Math.round((ultima().fechaVencimientoCredito - Date.parse(new Date().toLocaleDateString("en-CA"))) / 86400000);
  ok(diasVence >= 14 && diasVence <= 16, "vence en 15 días (" + diasVence + ")");
  tienda.ventasACredito = false;
  r = await vender({ pagos: [{ forma: "a_credito", monto: 0 }], clienteNombre: "Ana", clienteTelefono: "0981 123 456" }); ok(r.ok === false, "si el local no vende a crédito se rechaza");
  tienda.ventasACredito = true;
  r = await vender({ pagos: [{ forma: "a_credito", monto: 0 }], clienteNombre: "Ana", clienteTelefono: "0981 123 456", descuento: { tipo: "porcentaje", valor: 0, tipoDescuentoId: "t100" } });
  ok(r.ok === false, "una cortesía (cuenta en cero) no se carga a crédito");

  window.log("== Cortesía (100 %)");
  reiniciar();
  r = await vender({ descuento: { tipo: "porcentaje", valor: 0, tipoDescuentoId: "t100" }, comprobanteTipo: "factura", facturaTipoIdentificacion: "sin_nombre" });
  ok(r.ok === true && r.total === 0 && ultima().total === 0 && ultima().descuento === 12000, "una cortesía queda en 0 con el descuento completo, y se factura en 0");
  ok(comprobantes[0].total === 0 && ultima().facturaIva10 === 0, "la factura en cero no tiene IVA");

  window.log("== Descuentos que no valen");
  reiniciar();
  r = await vender({ descuento: { tipo: "porcentaje", valor: 100 } }); ok(r.ok === false && /Cortesía|100/.test(r.error), "100 % escrito a mano se rechaza (solo con un tipo de Ajustes)");
  r = await vender({ descuento: { tipo: "porcentaje", valor: 150 } }); ok(r.ok === false, "150 % se rechaza");
  r = await vender({ descuento: { tipo: "porcentaje", valor: -5 } }); ok(r.ok === false, "un descuento negativo se rechaza");
  r = await vender({ descuento: { tipo: "monto", valor: 12000 } }); ok(r.ok === false, "un monto igual al total se rechaza");
  r = await vender({ descuento: { tipo: "monto", valor: 99999 } }); ok(r.ok === false, "un monto mayor al total se rechaza");
  r = await vender({ descuento: { tipo: "monto", valor: 2000 } }); ok(r.ok === true && r.total === 10000, "un monto de 2.000 sobre 12.000 deja 10.000");
  r = await vender({ descuento: { tipo: "porcentaje", valor: 0, tipoDescuentoId: "inventado" } }); ok(r.ok === false, "un tipo de descuento que no existe se rechaza");
  r = await vender({ descuento: { tipo: "porcentaje", valor: 10, tipoDescuentoId: "t20" } });
  ok(r.ok === true && r.total === 9600, "con un tipo elegido manda SU porcentaje (20 %) aunque el navegador diga 10 % → total " + (r.ok ? r.total : r.error));

  window.log("== Intentos de trampa y datos raros");
  reiniciar();
  r = await vender({ items: [{ productId: "no-existe", cantidad: 1 }] }); ok(r.ok === false, "un producto que no existe (o de otro negocio) se rechaza");
  r = await vender({ items: [{ productId: "agotado", cantidad: 1 }] }); ok(r.ok === false && /disponible/.test(r.error), "un producto no disponible se rechaza");
  r = await vender({ items: [{ productId: "oculto", cantidad: 1 }] }); ok(r.ok === false, "un producto de una categoría desactivada se rechaza");
  for (const c of [0, -1, 1.5, NaN, Infinity, "3", null, 1001]) { r = await vender({ items: [{ productId: "cerveza", cantidad: c }] }); ok(r.ok === false, "cantidad " + String(c) + " se rechaza"); }
  r = await vender({ items: [] }); ok(r.ok === false, "el carrito vacío se rechaza");
  r = await vender({ items: [{ productId: "pizza", cantidad: 1, opcionIds: ["inventado"] }] }); ok(r.ok === false, "un agregado que no existe se rechaza");
  r = await vender({ items: [{ productId: "cerveza", cantidad: 1, precioUnitario: 1, precio: 1 }] });
  ok(r.ok === true && r.total === 12000, "un precio mandado desde el navegador se ignora: cobra 12.000, no 1");
  r = await vender({ items: [{ productId: "cerveza", cantidad: 1 }], totalMostrado: 11000 }); ok(r.ok === false && r.precioCambio === true, "si el total en pantalla no coincide, avisa del cambio de precio y no cobra");
  r = await vender({ items: [{ productId: "cerveza", cantidad: 1 }], totalMostrado: 12000 }); ok(r.ok === true, "y si coincide, cobra");
  const cuantas = ventas.length;
  turnoEstado = "cerrado"; r = await vender({}); ok(r.ok === false && r.sinTurno === true && ventas.length === cuantas, "con el turno cerrado no vende y manda a abrir turno");
  turnoEstado = "abierto";

  window.log("== El turno se cierra justo mientras se cobra");
  reiniciar();
  turnoSeCierraAlGuardar = true;
  const antesDeCerrar = ventas.length;
  r = await vender({});
  ok(r.ok === false && r.sinTurno === true && ventas.length === antesDeCerrar && movimientos.length === 0, "si otra persona cierra el turno entre la primera revisión y el guardado, NO se vende y la pantalla manda a abrir turno");
  turnoSeCierraAlGuardar = false;

  window.log("== Cerrar el turno");
  reiniciar();
  await vender({ items: [{ productId: "cerveza", cantidad: 1 }] });                                                                                // 12.000 efectivo
  await vender({ items: [{ productId: "pan", cantidad: 5 }], pagos: [{ forma: "transferencia", monto: 0 }] });                                    // 30.000 transferencia
  await vender({ items: [{ productId: "pizza", cantidad: 1 }], pagos: [{ forma: "efectivo", monto: 20000 }, { forma: "tarjeta_debito", monto: 30000 }] }); // 50.000 mixto
  await vender({ pagos: [{ forma: "a_credito", monto: 0 }], clienteNombre: "Ana", clienteTelefono: "0981 123 456" });                             // 12.000 a crédito: no entra a la caja
  ventas[1].cancelada = true;                                                                                                                     // la de transferencia se cancela
  const declarado = { efectivo: 32000, transferencia: 0, tarjetaDebito: 30000, tarjetaCredito: 0 };
  let c = await A.cerrarTurno("t1", declarado, "todo bien", 2, 62000);
  ok(c.ok === false && /cambiaron/.test(c.error) && turnoEstado === "abierto", "con los números de la pantalla desactualizados (cantidad o total distintos) NO cierra → " + (c.ok ? "" : c.error));
  c = await A.cerrarTurno("t1", { ...declarado, efectivo: -1 }, "", 3, 62000);
  ok(c.ok === false && turnoEstado === "abierto", "un monto declarado negativo se rechaza y no cierra");
  c = await A.cerrarTurno("t1", { ...declarado, efectivo: NaN }, "", 3, 62000);
  ok(c.ok === false && turnoEstado === "abierto", "un monto declarado que no es número se rechaza y no cierra");
  const [c1, c2] = await Promise.all([A.cerrarTurno("t1", declarado, "primero", 3, 62000), A.cerrarTurno("t1", { efectivo: 1, transferencia: 1, tarjetaDebito: 1, tarjetaCredito: 1 }, "segundo", 3, 62000)]);
  ok([c1.ok, c2.ok].filter(Boolean).length === 1, "dos cierres a la vez: solo UNO se firma (el otro recibe «ya está cerrado») → " + JSON.stringify([c1.ok, c2.ok]));
  ok(cierres.length === 1 && cierres[0].estado === "cerrado", "y queda una sola firma del cierre");
  const firma = cierres[0];
  ok(firma.calculadoEfectivo === 32000 && firma.calculadoTarjetaDebito === 30000 && firma.calculadoTransferencia === 0 && firma.cantidadVentas === 3,
    "lo calculado: efectivo 32.000 (12.000 + 20.000), débito 30.000, transferencia 0 (la cancelada no cuenta), 3 ventas; la de crédito no entra a la caja → " + JSON.stringify({ e: firma.calculadoEfectivo, d: firma.calculadoTarjetaDebito, t: firma.calculadoTransferencia, n: firma.cantidadVentas }));
  ok(firma.declaradoEfectivo === (c1.ok ? 32000 : 1) && firma.notas === (c1.ok ? "primero" : "segundo"), "y lo declarado que queda firmado es el del cierre que ganó, sin mezclar con el otro");
  c = await A.cerrarTurno("t1", declarado, "otra vez", 3, 62000);
  ok(c.ok === false && /cerrado/.test(c.error) && cierres.length === 1, "un tercer intento sobre el turno ya cerrado no cambia nada");

  window.log("== Peso");
  reiniciar();
  r = await vender({ items: [{ productId: "quesoKilo", cantidad: 1, peso: 0.35 }] });
  ok(r.ok === true && r.total === 28000, "350 g de queso a 80.000 el kilo = 28.000 → " + (r.ok ? r.total : r.error));
  r = await vender({ items: [{ productId: "cerveza", cantidad: 1, peso: 0.5 }] }); ok(r.ok === false, "el peso en un producto que no se vende así se rechaza");
  r = await vender({ items: [{ productId: "quesoKilo", cantidad: 1, peso: 0 }] }); ok(r.ok === false, "peso 0 se rechaza");

  window.log("== Reglas de factura");
  reiniciar(); tienda.facturaObligatoria = true;
  r = await vender({}); ok(r.ok === false && /exige facturar/.test(r.error), "si el local exige facturar, no se vende como ticket");
  r = await vender({ comprobanteTipo: "factura", facturaTipoIdentificacion: "sin_nombre" }); ok(r.ok === true, "y con factura sí");
  punto.timbradoHasta = new Date(ahora - 86400000);
  r = await vender({ comprobanteTipo: "factura", facturaTipoIdentificacion: "sin_nombre" }); ok(r.ok === false, "con el timbrado vencido no se puede facturar");
  reiniciar();
  r = await vender({ comprobanteTipo: "factura", facturaTipoIdentificacion: "ruc" }); ok(r.ok === false, "factura con RUC sin número ni razón social se rechaza");
  r = await vender({ comprobanteTipo: "factura", facturaTipoIdentificacion: "ruc", facturaNumeroIdentificacion: "80012345-6", facturaRazonSocial: "Cliente SA", facturaEmail: "sin-arroba" }); ok(r.ok === false, "un correo sin @ se rechaza");
  r = await vender({ comprobanteTipo: "factura", facturaTipoIdentificacion: "ruc", facturaNumeroIdentificacion: "80012345-6", facturaRazonSocial: "Cliente SA" });
  ok(r.ok === true && fiscales.length === 1 && ultima().facturaRuc === "80012345-6", "con RUC y razón social se emite y se guarda la ficha fiscal del cliente");

  // ==================================================================================== carritos al azar
  window.log("== 3.000 carritos al azar");
  reiniciar();
  const azar = (n) => Math.floor(Math.random() * n);
  const vendibles = ["pizza", "cerveza", "pan", "agua"];
  let malas = [], intentos = 0, exitosas = 0, rechazadasEsperadas = 0;
  for (let i = 0; i < 3000; i++) {
    const lineas = Array.from({ length: 1 + azar(5) }, () => { const id = vendibles[azar(4)]; return { productId: id, cantidad: 1 + azar(6), ...(id === "pizza" && Math.random() < 0.4 ? { opcionIds: ["queso"] } : {}) }; });
    let subtotal = 0; const consumoHarina = lineas.reduce((s, l) => s + (l.productId === "pizza" ? 0.3 * l.cantidad : 0), 0);
    for (const l of lineas) { const p = productos.find((x) => x.id === l.productId); subtotal += (Number(p.precio) + (l.opcionIds ? 5000 : 0)) * l.cantidad; }
    // el descuento
    const dado = azar(4); let descuento; let esperadoDesc = 0;
    if (dado === 1) { const pct = 1 + azar(99); descuento = { tipo: "porcentaje", valor: pct }; esperadoDesc = Math.round((subtotal * pct) / 100); }
    else if (dado === 2) { const monto = 1 + azar(subtotal - 1); descuento = { tipo: "monto", valor: monto }; esperadoDesc = monto; }
    else if (dado === 3) { descuento = { tipo: "porcentaje", valor: 0, tipoDescuentoId: "t20" }; esperadoDesc = Math.round(subtotal * 0.2); }
    const total = subtotal - esperadoDesc;
    // el pago: uno solo, o dividido (a veces mal sumado a propósito)
    let pagos; let debeFallar = false;
    if (Math.random() < 0.3 && total >= 10) {
      const a = 1 + azar(total - 1); pagos = [{ forma: "efectivo", monto: a }, { forma: ["transferencia", "tarjeta_debito", "tarjeta_credito"][azar(3)], monto: total - a }];
      if (Math.random() < 0.15) { pagos[1].monto += 1; debeFallar = true; }
    } else pagos = [{ forma: ["efectivo", "transferencia", "tarjeta_debito", "tarjeta_credito"][azar(4)], monto: 0 }];
    const factura = Math.random() < 0.6;
    const antes = ventas.length, harinaAntes = insumos.get("harina").stockActual, comprobantesAntes = comprobantes.length;
    intentos++;
    const res = await vender({ items: lineas, descuento, pagos, ...(factura ? { comprobanteTipo: "factura", facturaTipoIdentificacion: "sin_nombre" } : {}), totalMostrado: total });
    if (debeFallar) { if (res.ok || ventas.length !== antes) malas.push("debía fallar el pago mal sumado " + JSON.stringify({ lineas, pagos })); else rechazadasEsperadas++; continue; }
    if (!res.ok) { malas.push("falló una venta válida: " + res.error + " " + JSON.stringify({ lineas, descuento, pagos })); continue; }
    exitosas++;
    const v = ventas[ventas.length - 1];
    const falla = (m) => malas.push(m + " " + JSON.stringify({ lineas, descuento, pagos, total: v.total }));
    if (v.total !== total || res.total !== total) falla("total " + v.total + " ≠ esperado " + total);
    if (v.descuento !== esperadoDesc) falla("descuento " + v.descuento + " ≠ " + esperadoDesc);
    const sumaPagos = v.pagos.create.reduce((s, p) => s + p.monto, 0);
    if (Math.abs(sumaPagos - total) > 0.005) falla("los pagos suman " + sumaPagos);
    const sumaItems = v.items.create.reduce((s, it) => s + it.precioUnitario * it.cantidad, 0);
    if (sumaItems - v.descuento !== v.total) falla("ítems − descuento " + (sumaItems - v.descuento));
    if (Math.abs(harinaAntes - insumos.get("harina").stockActual - consumoHarina) > 1e-6) falla("el stock bajó " + (harinaAntes - insumos.get("harina").stockActual) + " y debía bajar " + consumoHarina);
    if (factura) {
      const suma = v.facturaGravado10 + v.facturaGravado5 + v.facturaExento;
      if (Math.abs(suma - total) > 0.005) falla("las tasas suman " + suma);
      if (v.facturaIva10 !== Math.round(v.facturaGravado10 / 11) || v.facturaIva5 !== Math.round(v.facturaGravado5 / 21)) falla("IVA mal");
      const c = comprobantes[comprobantes.length - 1];
      if (comprobantes.length !== comprobantesAntes + 1) falla("no se creó el comprobante");
      else {
        if (c.total !== total || c.numero !== v.facturaNumero) falla("comprobante distinto de la venta");
        if (c.items.create.reduce((s, it) => s + it.total, 0) !== total) falla("las líneas del comprobante no suman el total");
        if (c.gravado10 !== v.facturaGravado10 || c.gravado5 !== v.facturaGravado5 || c.exento !== v.facturaExento || c.iva10 !== v.facturaIva10 || c.iva5 !== v.facturaIva5) falla("tasas del comprobante ≠ las de la venta");
        if (c.items.create.some((it) => !Number.isInteger(it.total))) falla("una línea de la factura no es entera");
      }
    } else if (comprobantes.length !== comprobantesAntes) falla("se creó un comprobante en un ticket");
  }
  ok(malas.length === 0, intentos + " intentos (" + exitosas + " ventas, " + rechazadasEsperadas + " pagos mal sumados rechazados): " + malas.length + " con problemas" + (malas[0] ? " · primera: " + malas[0] : ""));
  const numeros = ventas.filter((x) => x.facturaNumero).map((x) => Number(x.facturaNumero.split("-")[2]));
  ok(numeros.every((n, i) => n === i + 1), "los números de factura salen correlativos, sin saltos ni repetidos (" + numeros.length + " facturas)");

  window.log("\naciertos: " + window.__aciertos + " · fallas: " + window.__fallas);
  window.__listo = true;
})().catch((e) => { document.getElementById("salida").textContent += "\nERROR: " + (e && e.stack || e); window.__listo = true; window.__fallas = (window.__fallas || 0) + 1; });
