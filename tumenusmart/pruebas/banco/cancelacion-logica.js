// Cancelar una cuenta cobrada (cancelarVenta) y anular una factura sola (cancelarFactura) con las acciones REALES del servidor y una base en memoria.
// Lo que se cuida: el stock vuelve UNA sola vez (aunque se toque dos veces o desde dos pestañas), no se cancela con el turno cerrado,
// la factura y su comprobante se anulan juntos, y la DNIT recibe UN pedido de cancelación por documento.
(async () => {
  const C = window.Cargador; const S = C.simulacros; const { ok } = window;

  // ------------------------------------------------------------------------------------------ el estado del «local»
  let turnoEstado, turnoSeCierraAlGuardar, claveOk, cobros, ventas, movs, insumos, comprobantes, cuentaMesa, cuentaDelivery, bitacoras, pedidosSifen, efectos, contadorMov;
  const reiniciar = () => {
    turnoEstado = "abierto"; turnoSeCierraAlGuardar = false; claveOk = true; cobros = 0; contadorMov = 0;
    insumos = new Map([["harina", { stockActual: 1000 }]]);
    ventas = new Map([["v1", { id: "v1", numero: 7, total: 110000, cancelada: false, turnoPosId: "t1", facturaNumero: "001-001-0000001", facturaAnulada: false, creadoEn: new Date() }]]);
    movs = []; comprobantes = [{ ventaPosId: "v1", estado: "vigente", modalidad: "autoimpresor", doc: null }];
    cuentaMesa = null; cuentaDelivery = null; bitacoras = []; pedidosSifen = []; efectos = { propinas: 0, citasBorradas: 0, citasLiberadas: 0, canchas: 0 };
  };
  // «Vendió 2 pizzas»: la harina bajó 0,6 y quedó el movimiento de venta.
  const conConsumo = (cant = 0.6) => { insumos.get("harina").stockActual -= cant; movs.push({ ventaPosId: "v1", tipo: "venta", insumoId: "harina", almacenId: "alm1", cantidad: -cant, motivo: "2 × Pizza" }); };
  const harina = () => Math.round(insumos.get("harina").stockActual * 1000) / 1000;
  const devueltos = () => movs.filter((m) => m.tipo === "cancelacion");

  const aplica = (v, where) => Object.entries(where).every(([k, w]) => {
    if (k === "storeId") return true;
    if (w && typeof w === "object" && "not" in w) return w.not === null ? v[k] != null : v[k] !== w.not;
    return v[k] === w;
  });
  const db = {
    ventaPos: { findUnique: async ({ where }) => { const v = ventas.get(where.id); return v ? { ...v, turnoPos: { estado: turnoEstado }, _count: { cobros } } : null; } },
  };
  const tx = {
    turnoPos: { findFirst: async ({ where }) => (!turnoSeCierraAlGuardar && turnoEstado === where.estado ? { id: where.id } : null) },
    // La reclamación condicionada: solo cambia si todavía cumple (como la base real con el `where` adentro de la transacción).
    ventaPos: { updateMany: async ({ where, data }) => { const v = ventas.get(where.id); if (!v || !aplica(v, where)) return { count: 0 }; Object.assign(v, data); return { count: 1 }; } },
    comprobante: {
      findMany: async ({ where }) => comprobantes.filter((c) => c.ventaPosId === where.ventaPosId && c.estado === where.estado && c.modalidad === where.modalidad).map((c) => ({ documentoElectronico: c.doc ? { id: c.doc } : null })),
      updateMany: async ({ where, data }) => { let n = 0; for (const c of comprobantes) if (c.ventaPosId === where.ventaPosId && c.estado === where.estado) { Object.assign(c, data); n++; } return { count: n }; },
    },
    movimientoStock: {
      findMany: async ({ where }) => movs.filter((m) => m.ventaPosId === where.ventaPosId && where.tipo.in.includes(m.tipo)),
      createMany: async ({ data }) => { movs.push(...data); },
    },
    insumo: { update: async ({ where, data }) => { const i = insumos.get(where.id); if (data.stockActual?.decrement != null) i.stockActual -= data.stockActual.decrement; if (data.stockActual?.increment != null) i.stockActual += data.stockActual.increment; return i; } },
    almacen: { findFirst: async () => ({ id: "alm1" }) },
    cuentaMesa: { findFirst: async () => cuentaMesa, update: async ({ data }) => { Object.assign(cuentaMesa, data); } },
    cuentaDelivery: { findFirst: async () => cuentaDelivery, update: async ({ data }) => { Object.assign(cuentaDelivery, data); } },
    propinaMozo: { updateMany: async () => { efectos.propinas++; return { count: 0 }; } },
    cita: { deleteMany: async () => { efectos.citasBorradas++; return { count: 0 }; }, updateMany: async () => { efectos.citasLiberadas++; return { count: 0 }; } },
    reservaCancha: { updateMany: async () => { efectos.canchas++; return { count: 0 }; } },
  };
  S["src/lib/auth"] = { exigirPermiso: async () => ({ nombre: "Caja", email: "caja@x.com", rol: "caja" }) };
  S["src/lib/local-actual"] = { idLocalActual: async () => "L1" };
  S["src/lib/prisma"] = { prisma: { $transaction: async (cb) => cb(tx) } };
  S["src/lib/prisma-local"] = { prismaDelLocal: () => db, siguienteNumeroVentaPos: async () => 1, upsertClienteFiscal: async () => {} };
  S["@prisma/client"] = { Prisma: {} };
  S["src/lib/bitacora"] = { registrarBitacora: async (_l, _s, d) => { bitacoras.push(d); } };
  S["src/lib/cargar-elaborados"] = { cargarElaborados: async () => new Map() };
  S["src/lib/sifen/servidor"] = { ErrorFacturaElectronica: class extends Error {}, problemaParaEmitirElectronico: async () => null, firmarDocumentoAlVender: async () => {}, cargarFactura: async () => null };
  S["src/lib/sifen/solicitudes"] = { solicitarCancelacion: async (_db, d) => { pedidosSifen.push(d.documentoId); } };
  S["src/lib/seguridad-servidor"] = { exigirAutorizacion: async () => (claveOk ? { ok: true } : { ok: false, error: "Falta la contraseña de un usuario autorizado.", requiereClave: true }) };
  S["src/lib/tipos-descuento-servidor"] = { cargarTiposDescuento: async () => [] };
  S["src/lib/promociones-servidor"] = { cargarPromociones: async () => [] };
  S["src/app/admin/(protected)/pos/turno-actual"] = { turnoAbierto: async () => null, pedidosDelTurno: async () => [], netoMovimientosCaja: async () => ({ ingresos: 0, retiros: 0, neto: 0 }) };
  S["src/lib/estacion-actual"] = { estacionActual: async () => null };
  S["src/lib/sifen/armar-de"] = { armarDE: () => ({}), armarRDE: () => ({}) };
  S["src/lib/sifen/xml"] = { aXmlRDE: () => "" };
  S["next/cache"] = { revalidatePath() {} };

  const A = await C.cargar("src/app/admin/(protected)/pos/actions");
  const F = await C.cargar("src/app/admin/(protected)/facturas/actions");

  // ============================================================================================== cancelar una cuenta
  window.log("== Cancelar una cuenta con factura y stock");
  reiniciar(); conConsumo();
  let r = await A.cancelarVenta("v1", "Se equivocó el pedido");
  let v = ventas.get("v1");
  ok(r.ok === true, "se cancela → " + JSON.stringify(r));
  ok(v.cancelada === true && v.canceladaPor === "Caja" && v.motivoCancelacion === "Se equivocó el pedido", "queda cancelada, con quién y por qué");
  ok(v.facturaAnulada === true && v.facturaMotivoAnulacion === "Se equivocó el pedido", "y su factura queda anulada con la cuenta");
  ok(comprobantes[0].estado === "anulado", "el comprobante de la factura también queda anulado");
  ok(harina() === 1000 && devueltos().length === 1 && devueltos()[0].cantidad === 0.6, "la harina vuelve a 1000 con UN movimiento de cancelación de 0,6 → " + harina());
  ok(bitacoras.length === 1 && bitacoras[0].accion === "venta_cancelada", "queda en la bitácora");
  ok(efectos.propinas === 1, "se revisan las propinas pendientes de esa venta");

  window.log("== Cancelar dos veces");
  r = await A.cancelarVenta("v1", "otra vez");
  ok(r.ok === false && /ya estaba cancelada/.test(r.error), "la segunda vez avisa que ya estaba cancelada → " + (r.ok ? "" : r.error));
  ok(harina() === 1000 && devueltos().length === 1 && bitacoras.length === 1, "y NO devuelve el stock otra vez ni repite la bitácora");

  window.log("== Dos cancelaciones al mismo tiempo (dos pestañas)");
  reiniciar(); conConsumo(); comprobantes[0].modalidad = "electronico"; comprobantes[0].doc = "doc1";
  const [a, b] = await Promise.all([A.cancelarVenta("v1", "pestaña 1"), A.cancelarVenta("v1", "pestaña 2")]);
  ok([a.ok, b.ok].filter(Boolean).length === 1, "solo UNA gana → " + JSON.stringify([a.ok, b.ok]));
  ok(harina() === 1000 && devueltos().length === 1, "el stock vuelve una sola vez (1000, un movimiento) → " + harina() + " / " + devueltos().length);
  ok(bitacoras.length === 1 && efectos.propinas === 1, "la bitácora y las propinas se tocan una sola vez");
  ok(pedidosSifen.length === 1 && pedidosSifen[0] === "doc1", "y la DNIT recibe UN solo pedido de cancelación del documento electrónico → " + JSON.stringify(pedidosSifen));

  window.log("== Turno cerrado");
  reiniciar(); conConsumo(); turnoEstado = "cerrado";
  r = await A.cancelarVenta("v1", "tarde");
  ok(r.ok === false && /turno/.test(r.error) && ventas.get("v1").cancelada === false && harina() === 999.4 && comprobantes[0].estado === "vigente", "con el turno cerrado no se cancela y no se toca nada → " + (r.ok ? "" : r.error));
  reiniciar(); conConsumo(); turnoSeCierraAlGuardar = true;
  r = await A.cancelarVenta("v1", "justo");
  ok(r.ok === false && /turno/.test(r.error), "si el turno se cierra JUSTO entre la revisión y el guardado, tampoco se cancela → " + (r.ok ? "" : r.error));
  ok(ventas.get("v1").cancelada === false && harina() === 999.4 && comprobantes[0].estado === "vigente" && bitacoras.length === 0 && devueltos().length === 0, "y no queda nada a medias: ni cancelada, ni stock devuelto, ni bitácora");

  window.log("== Otras reglas");
  reiniciar(); conConsumo(); cobros = 2;
  r = await A.cancelarVenta("v1", "x");
  ok(r.ok === false && /cobros/.test(r.error) && ventas.get("v1").cancelada === false, "una venta a crédito con cobros registrados no se cancela → " + (r.ok ? "" : r.error));
  reiniciar(); conConsumo(); claveOk = false;
  r = await A.cancelarVenta("v1", "sin permiso");
  ok(r.ok === false && r.requiereClave === true && ventas.get("v1").cancelada === false && harina() === 999.4, "si Seguridad pide contraseña y falta, no se toca nada y la pantalla pide la clave");
  reiniciar(); conConsumo();
  for (const m of ["", "   ", undefined, null]) { r = await A.cancelarVenta("v1", m); ok(r.ok === false && ventas.get("v1").cancelada === false, "sin motivo (" + JSON.stringify(m) + ") se rechaza en el servidor"); }
  r = await A.cancelarVenta("no-existe", "x"); ok(r.ok === false && /no existe/.test(r.error), "una cuenta que no existe (o de otro negocio) se rechaza");

  window.log("== Venta sin factura");
  reiniciar(); conConsumo(); ventas.get("v1").facturaNumero = null; comprobantes = [];
  r = await A.cancelarVenta("v1", "sin factura");
  v = ventas.get("v1");
  ok(r.ok === true && v.cancelada === true && v.facturaAnulada === false && harina() === 1000, "se cancela, el stock vuelve y no inventa una anulación de factura");

  window.log("== Ya se había devuelto una parte (producto cancelado antes)");
  reiniciar(); conConsumo(1.0); movs.push({ ventaPosId: "v1", tipo: "cancelacion", insumoId: "harina", almacenId: "alm1", cantidad: 0.4, motivo: "2 × Pizza" }); insumos.get("harina").stockActual += 0.4;
  r = await A.cancelarVenta("v1", "resto");
  ok(r.ok === true && harina() === 1000, "al cancelar la cuenta vuelve solo lo que faltaba (0,6), no se devuelve dos veces → " + harina());

  window.log("== Cuenta de una mesa / de un delivery cobrada");
  reiniciar(); insumos.get("harina").stockActual -= 0.6; ventas.get("v1").facturaNumero = null; comprobantes = [];
  cuentaMesa = { id: "cm1", items: [{ cantidad: 2, nombreProducto: "Pizza", consumo: [{ insumoId: "harina", almacenId: "alm1", cantidad: 0.6 }] }], estado: "pagada" };
  r = await A.cancelarVenta("v1", "mesa");
  ok(r.ok === true && harina() === 1000 && cuentaMesa.estado === "anulada" && /Cobro cancelado/.test(cuentaMesa.motivoCierre), "una cuenta del comedor: vuelve el stock de sus productos y la cuenta queda anulada");
  reiniciar(); insumos.get("harina").stockActual -= 0.6; ventas.get("v1").facturaNumero = null; comprobantes = [];
  cuentaDelivery = { id: "cd1", items: [{ cantidad: 2, nombreProducto: "Pizza", consumo: [{ insumoId: "harina", almacenId: "alm1", cantidad: 0.6 }] }], estado: "pagada" };
  r = await A.cancelarVenta("v1", "delivery");
  ok(r.ok === true && harina() === 1000 && cuentaDelivery.estado === "anulada", "una cuenta de delivery: lo mismo");

  // ============================================================================================== anular solo la factura
  window.log("== Anular la factura SIN cancelar la cuenta");
  reiniciar(); conConsumo();
  r = await F.cancelarFactura("venta", "v1", "RUC mal escrito", false);
  v = ventas.get("v1");
  ok(r.ok === true && v.facturaAnulada === true && v.cancelada === false && v.facturaMotivoAnulacion === "RUC mal escrito", "la factura queda anulada y la cuenta sigue viva → " + JSON.stringify(r));
  ok(comprobantes[0].estado === "anulado" && harina() === 999.4 && devueltos().length === 0, "el comprobante se anula, y el stock NO se toca (la venta sigue valiendo)");
  r = await F.cancelarFactura("venta", "v1", "otra vez", false);
  ok(r.ok === false && /ya estaba anulada/.test(r.error), "anularla de nuevo avisa que ya estaba anulada → " + (r.ok ? "" : r.error));
  reiniciar(); comprobantes[0].modalidad = "electronico"; comprobantes[0].doc = "doc9";
  const [f1, f2] = await Promise.all([F.cancelarFactura("venta", "v1", "pestaña 1", false), F.cancelarFactura("venta", "v1", "pestaña 2", false)]);
  ok([f1.ok, f2.ok].filter(Boolean).length === 1, "dos anulaciones a la vez: solo UNA gana → " + JSON.stringify([f1.ok, f2.ok]));
  ok(pedidosSifen.length === 1, "y la DNIT recibe UN solo pedido de cancelación → " + JSON.stringify(pedidosSifen));
  ok(bitacoras.filter((x) => x.accion === "factura_anulada").length === 1, "y la bitácora lo anota una sola vez");
  reiniciar(); ventas.get("v1").cancelada = true;
  r = await F.cancelarFactura("venta", "v1", "x", false);
  ok(r.ok === false && /cancelada/.test(r.error), "sobre una cuenta ya cancelada se rechaza");
  reiniciar(); ventas.get("v1").facturaNumero = null;
  r = await F.cancelarFactura("venta", "v1", "x", false); ok(r.ok === false && /no tiene factura/.test(r.error), "una venta sin factura no tiene qué anular");
  reiniciar();
  r = await F.cancelarFactura("venta", "v1", "   ", false); ok(r.ok === false && ventas.get("v1").facturaAnulada === false, "sin motivo se rechaza");

  window.log("== Factura de un mes que ya terminó");
  reiniciar(); const hoy = new Date(); ventas.get("v1").creadoEn = new Date(hoy.getFullYear(), hoy.getMonth() - 2, 15, 12);
  r = await F.cancelarFactura("venta", "v1", "tarde", false);
  ok(r.ok === false && ventas.get("v1").facturaAnulada === false, "sin confirmar el aviso del mes cerrado NO se anula → " + (r.ok ? "" : r.error));
  r = await F.cancelarFactura("venta", "v1", "tarde", false, true);
  ok(r.ok === true && ventas.get("v1").facturaAnulada === true && /mes ya terminado/.test(bitacoras[bitacoras.length - 1].descripcion), "confirmándolo sí, y la bitácora lo marca como de un mes ya terminado");

  window.log("== Anular la factura Y cancelar la cuenta");
  reiniciar(); conConsumo();
  r = await F.cancelarFactura("venta", "v1", "todo mal", true);
  ok(r.ok === true && ventas.get("v1").cancelada === true && harina() === 1000, "cancelarFactura con la cuenta usa la cancelación real: cuenta cancelada y stock devuelto");
  reiniciar(); conConsumo(); turnoEstado = "cerrado";
  r = await F.cancelarFactura("venta", "v1", "todo mal", true);
  ok(r.ok === false && ventas.get("v1").facturaAnulada === false && harina() === 999.4, "con el turno cerrado no se puede cancelar la cuenta, y entonces tampoco se toca la factura");

  window.log("\naciertos: " + window.__aciertos + " · fallas: " + window.__fallas);
  window.__listo = true;
})().catch((e) => { document.getElementById("salida").textContent += "\nERROR: " + (e && e.stack || e); window.__listo = true; window.__fallas = (window.__fallas || 0) + 1; });
