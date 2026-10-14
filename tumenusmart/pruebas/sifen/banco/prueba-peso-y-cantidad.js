// Prueba de «Cantidad de la selección» del Punto de venta: cargar muchas unidades de una vez (50 empanadas para un evento) y vender por
// peso (gramos o kilos) con el monto calculado. Es el código real de precio-pedido.ts (el servidor), unidad-medida.ts (los pesos) y
// precio-carrito-pos.ts (la pantalla): la pantalla y el servidor tienen que dar EXACTAMENTE el mismo monto.
(async () => {
  const { ok, igual } = window;
  const C = window.Cargador;

  const um = await C.cargar("src/lib/unidad-medida");
  const pp = await C.cargar("src/lib/precio-pedido");
  const rc = await C.cargar("src/lib/precio-carrito-pos");

  // =============================================================== los pesos
  window.log("== Peso: validar, escribir y leer");
  ok(um.seVendePorPeso("kilogramo") && um.seVendePorPeso("litro"), "kilogramo y litro se venden por peso");
  ok(!um.seVendePorPeso("unidad") && !um.seVendePorPeso(undefined) && !um.seVendePorPeso(null), "unidad (o nada) no");
  for (const v of [0.001, 0.35, 1, 1.25, 12.5, 999.999]) ok(um.pesoValido(v), `${v} es un peso válido`);
  for (const v of [0, -1, 0.0005, 0.3504, 1000, 1e9, NaN, Infinity, "1", null, undefined]) ok(!um.pesoValido(v), `${String(v)} no es un peso válido`);
  igual(um.textoDePeso(0.35, "kilogramo"), "350 g", "0,35 kg se lee 350 g");
  igual(um.textoDePeso(0.001, "kilogramo"), "1 g", "1 g");
  igual(um.textoDePeso(0.999, "kilogramo"), "999 g", "999 g");
  igual(um.textoDePeso(1, "kilogramo"), "1 kg", "1 kg");
  igual(um.textoDePeso(1.25, "kilogramo"), "1,25 kg", "1,25 kg con coma");
  igual(um.textoDePeso(0.25, "litro"), "250 ml", "0,25 L = 250 ml");
  igual(um.textoDePeso(1.5, "litro"), "1,5 L", "1,5 L");
  igual(um.pesoDesdeEscrito("350", true), 0.35, "350 g → 0,35");
  igual(um.pesoDesdeEscrito("1,5", false), 1.5, "1,5 kg con coma");
  igual(um.pesoDesdeEscrito("1.5", false), 1.5, "1.5 kg con punto");
  igual(um.pesoDesdeEscrito("250", true), 0.25, "250 ml → 0,25 L");
  igual(um.pesoDesdeEscrito("1200", true), 1.2, "1200 g → 1,2 kg");
  igual(um.pesoDesdeEscrito("350,4", true), 0.35, "350,4 g se redondea al gramo");
  igual(um.pesoDesdeEscrito("", true), null, "vacío no es un peso");
  igual(um.pesoDesdeEscrito("abc", true), null, "letras no");
  igual(um.pesoDesdeEscrito("0", true), null, "cero no");
  igual(um.pesoDesdeEscrito("-5", true), null, "negativo no");
  igual(um.pesoDesdeEscrito("1,5", true), 0.002, "1,5 g se redondea al gramo entero (2 g): la balanza no pesa fracciones de gramo");
  igual(um.pesoDesdeEscrito("0,4", true), null, "0,4 g redondea a cero: no es un peso");
  igual(um.pesoDesdeEscrito("2000000", true), null, "2000 kg no");

  // =============================================================== el servidor: precio, nombre, stock y costo
  window.log("== Peso: lo que arma el servidor");
  const producto = (extra = {}) => ({
    id: "p-queso", nombre: "Queso", precio: 40000, disponible: true, ingredientes: [], mitadYMitadGrupo: null, mitadYMitadModo: "mayor",
    iva: "gravado10", opciones: [], receta: [{ insumoId: "i-queso", cantidad: 1 }], costo: 25000, almacenId: null, unidadMedida: "kilogramo", ...extra,
  });
  const unidad = producto({ id: "p-empanada", nombre: "Empanada", precio: 5000, unidadMedida: "unidad", receta: [], costo: 2000 });
  const CARTA = [producto(), unidad];

  let r = pp.armarPedido(CARTA, [{ productId: "p-queso", cantidad: 1, peso: 0.35 }], pp.LIMITES_DE_CAJA);
  ok(r.ok && r.lineas.length === 1 && r.lineas[0].precioUnitario === 14000 && r.subtotal === 14000, "350 g a 40.000 el kilo son 14.000");
  ok(r.ok && r.lineas[0].nombreProducto === "Queso (350 g)" && r.lineas[0].porPeso === true, "el nombre lleva lo pesado y la línea queda marcada");
  ok(r.ok && r.lineas[0].consumo.length === 1 && Math.abs(r.lineas[0].consumo[0].cantidad - 0.35) < 1e-9, "el stock descuenta 0,35 de la receta (que es por kilo)");
  ok(r.ok && Math.abs(r.lineas[0].costoProducto - 8750) < 1e-6, "el costo de la línea es 25.000 × 0,35");
  r = pp.armarPedido(CARTA, [{ productId: "p-queso", cantidad: 1, peso: 1.25 }], pp.LIMITES_DE_CAJA);
  ok(r.ok && r.lineas[0].precioUnitario === 50000 && r.lineas[0].nombreProducto === "Queso (1,25 kg)", "1,25 kg son 50.000 y se lee «1,25 kg»");
  r = pp.armarPedido([producto({ precio: 45500 })], [{ productId: "p-queso", cantidad: 1, peso: 0.333 }], pp.LIMITES_DE_CAJA);
  ok(r.ok && r.lineas[0].precioUnitario === Math.round(45500 * 0.333) && Number.isInteger(r.lineas[0].precioUnitario), "el monto siempre es un número entero de guaraníes");
  r = pp.armarPedido(CARTA, [{ productId: "p-queso", cantidad: 2, peso: 0.35 }], pp.LIMITES_DE_CAJA);
  ok(r.ok && r.subtotal === 28000, "2 porciones de 350 g son 28.000");
  r = pp.armarPedido(CARTA, [{ productId: "p-queso", cantidad: 1 }], pp.LIMITES_DE_CAJA);
  ok(r.ok && r.lineas[0].precioUnitario === 40000 && r.lineas[0].nombreProducto === "Queso" && r.lineas[0].porPeso === undefined, "sin peso se vende como siempre (1 kilo al precio de lista)");
  ok(r.ok && !("porPeso" in r.lineas[0]), "y la línea no trae la marca de peso");
  // con un agregado: el agregado se suma sin multiplicar por el peso
  const conAgregado = producto({ opciones: [{ id: "o-1", nombre: "Envase", tipo: "agregado", precioExtra: 2000, costo: 500, receta: [], almacenId: null }] });
  r = pp.armarPedido([conAgregado], [{ productId: "p-queso", opcionIds: ["o-1"], cantidad: 1, peso: 0.5 }], pp.LIMITES_DE_CAJA);
  ok(r.ok && r.lineas[0].precioUnitario === 22000 && r.lineas[0].precioAgregados === 2000, "medio kilo con un agregado de 2.000: 20.000 + 2.000");

  const rechaza = (titulo, resultado) => ok(resultado.ok === false && typeof resultado.motivo === "string", titulo + (resultado.ok ? " (pasó)" : ""));
  rechaza("un producto por unidad no se pesa", pp.armarPedido(CARTA, [{ productId: "p-empanada", cantidad: 1, peso: 0.5 }], pp.LIMITES_DE_CAJA));
  for (const peso of [0, -1, 0.0005, 0.3504, 1000, NaN, "0.5", null]) {
    rechaza(`peso ${JSON.stringify(peso)} se rechaza`, pp.armarPedido(CARTA, [{ productId: "p-queso", cantidad: 1, peso }], pp.LIMITES_DE_CAJA));
  }
  rechaza("un combo mitad y mitad no se pesa", pp.armarPedido(CARTA, [{ mitadYMitad: { productIdA: "p-queso", productIdB: "p-empanada" }, cantidad: 1, peso: 0.5 }], pp.LIMITES_DE_CAJA));

  // =============================================================== muchas unidades de una vez
  window.log("== Cantidad: los topes de la caja y los de la carta pública");
  const una = (cantidad, id = "p-empanada") => [{ productId: id, cantidad }];
  ok(pp.armarPedido(CARTA, una(50)).ok, "la carta pública acepta 50 de un producto");
  rechaza("la carta pública NO acepta 51 (sigue igual que siempre)", pp.armarPedido(CARTA, una(51)));
  rechaza("por defecto tampoco (los otros canales no cambian)", pp.armarPedido(CARTA, una(51), undefined));
  r = pp.armarPedido(CARTA, una(300), pp.LIMITES_DE_CAJA);
  ok(r.ok && r.subtotal === 1500000, "la caja acepta 300 empanadas (para un evento): 1.500.000");
  ok(pp.armarPedido(CARTA, una(1000), pp.LIMITES_DE_CAJA).ok, "y hasta 1000 en una línea");
  rechaza("pero 1001 no (es un error de tipeo)", pp.armarPedido(CARTA, una(1001), pp.LIMITES_DE_CAJA));
  rechaza("cantidad con decimales no", pp.armarPedido(CARTA, una(2.5), pp.LIMITES_DE_CAJA));
  rechaza("cantidad cero no", pp.armarPedido(CARTA, una(0), pp.LIMITES_DE_CAJA));
  const muchas = Array.from({ length: 5 }, () => ({ productId: "p-empanada", cantidad: 1000 }));
  ok(pp.armarPedido(CARTA, muchas, pp.LIMITES_DE_CAJA).ok, "5.000 unidades en total todavía entran en la caja");
  rechaza("5.001 ya no", pp.armarPedido(CARTA, [...muchas, { productId: "p-empanada", cantidad: 1 }], pp.LIMITES_DE_CAJA));
  const msjPublico = pp.armarPedido(CARTA, una(51));
  ok(!msjPublico.ok && msjPublico.motivo.includes("WhatsApp"), "el aviso de la carta pública sigue mandando a escribir por WhatsApp");
  const msjCaja = pp.armarPedido(CARTA, una(1001), pp.LIMITES_DE_CAJA);
  ok(!msjCaja.ok && !msjCaja.motivo.includes("WhatsApp"), "el de la caja no habla de WhatsApp");

  // =============================================================== la pantalla da el mismo monto que el servidor
  window.log("== La pantalla y el servidor dan lo mismo");
  const categorias = [{
    id: "c1", nombre: "Fiambres",
    productos: [{ id: "p-queso", nombre: "Queso", precio: 40000, esServicio: false, unidadMedida: "kilogramo", agregados: [{ id: "o-1", nombre: "Envase", precioExtra: 2000 }] }],
  }];
  let casos = 0, distintos = 0;
  for (const precio of [40000, 45500, 33333, 12345, 999, 100000]) {
    for (const peso of [0.001, 0.05, 0.25, 0.333, 0.35, 0.5, 0.999, 1, 1.25, 2.5, 10.123]) {
      for (const agregados of [[], ["o-1"]]) {
        const cat = [{ ...categorias[0], productos: [{ ...categorias[0].productos[0], precio }] }];
        const carrito = [{ tipo: "producto", productId: "p-queso", agregadoIds: agregados, precio: 0, peso }];
        const pantalla = rc.repreciarCarrito(carrito, cat, [])[0].precio;
        const servidor = pp.armarPedido(
          [producto({ precio, opciones: [{ id: "o-1", nombre: "Envase", tipo: "agregado", precioExtra: 2000, costo: null, receta: [], almacenId: null }] })],
          [{ productId: "p-queso", opcionIds: agregados, cantidad: 1, peso }],
          pp.LIMITES_DE_CAJA
        );
        casos++;
        if (!servidor.ok || servidor.lineas[0].precioUnitario !== pantalla) distintos++;
      }
    }
  }
  ok(casos === 132 && distintos === 0, `${casos} combinaciones de precio, peso y agregado: la pantalla y el servidor dan el mismo monto (${distintos} distintos)`);
  const sinPeso = rc.repreciarCarrito([{ tipo: "producto", productId: "p-queso", agregadoIds: [], precio: 1 }], categorias, [])[0];
  igual(sinPeso.precio, 40000, "sin peso la línea vale el precio de lista");

  // =============================================================== el monto de lo pesado es EXACTO
  window.log("== Peso: el monto es exacto (sin errores de coma flotante)");
  igual(um.montoPorPeso(45500, 0.333), 15152, "45.500 × 0,333 = 15.151,5 → 15.152 (la mitad sube)");
  igual(um.montoPorPeso(3, 0.5), 2, "3 × 0,5 = 1,5 → 2");
  igual(um.montoPorPeso(1, 0.5), 1, "1 × 0,5 = 0,5 → 1");
  igual(um.montoPorPeso(999, 0.001), 1, "999 × 0,001 = 0,999 → 1");
  igual(um.montoPorPeso(40000, 0.35), 14000, "40.000 × 0,35 = 14.000 justo");
  igual(um.montoPorPeso(12345, 0.007), 86, "12.345 × 0,007 = 86,415 → 86");
  // contra la cuenta con enteros (medio guaraní hacia arriba), para miles de precios y pesos
  let malos = 0, total = 0;
  for (let precio = 100; precio <= 200000; precio += 1237) {
    for (let g = 1; g <= 3000; g += 7) {
      total++;
      const esperado = Math.floor((precio * g + 500) / 1000);
      if (um.montoPorPeso(precio, g / 1000) !== esperado) malos++;
    }
  }
  ok(malos === 0 && total > 50000, `${total} combinaciones de precio y gramos: el monto coincide con la cuenta exacta (${malos} distintos)`);

  // =============================================================== IVA y totales con lo pesado
  window.log("== IVA y totales con lo pesado");
  const fp = await C.cargar("src/lib/factura-pos");
  const dv = await C.cargar("src/lib/descuento-venta");
  const pr = await C.cargar("src/lib/promociones");
  const ps = await C.cargar("src/lib/precio-promocion");

  const cartaIva = [
    producto({ id: "k10", nombre: "Queso", precio: 45500, iva: "gravado10" }),
    producto({ id: "k5", nombre: "Verdura", precio: 12345, iva: "gravado5" }),
    producto({ id: "kx", nombre: "Sal", precio: 7777, iva: "exento" }),
    producto({ id: "u10", nombre: "Empanada", precio: 5000, iva: "gravado10", unidadMedida: "unidad", receta: [], costo: null }),
  ];
  const lineasDe = (pedidas) => {
    const a = pp.armarPedido(cartaIva, pedidas, pp.LIMITES_DE_CAJA);
    if (!a.ok) throw new Error(a.motivo);
    return a;
  };
  const esEntero = (n) => Number.isInteger(n);
  const revisar = (titulo, a, descuento) => {
    const subtotal = a.lineas.reduce((s, l) => s + l.precioUnitario * l.cantidad, 0);
    const d = fp.desglosarIva(a.lineas, descuento);
    const suma = d.gravado10 + d.gravado5 + d.exento;
    const sinDecimales = [d.gravado10, d.gravado5, d.exento, d.iva10, d.iva5, d.totalGeneral].every(esEntero);
    ok(a.lineas.every((l) => esEntero(l.precioUnitario) && esEntero(l.cantidad)) && esEntero(subtotal), `${titulo}: cada línea y el subtotal son guaraníes enteros`);
    ok(sinDecimales && suma === d.totalGeneral && d.totalGeneral === subtotal - descuento, `${titulo}: las tres tasas suman EXACTO el total cobrado (${d.totalGeneral})`);
    ok(d.iva10 === Math.round(d.gravado10 / 11) && d.iva5 === Math.round(d.gravado5 / 21), `${titulo}: el IVA es gravado ÷ 11 (10 %) y ÷ 21 (5 %), en enteros`);
  };
  const mezcla = lineasDe([
    { productId: "k10", cantidad: 1, peso: 0.333 },
    { productId: "k5", cantidad: 2, peso: 1.237 },
    { productId: "kx", cantidad: 1, peso: 0.45 },
    { productId: "u10", cantidad: 12 },
  ]);
  revisar("una cuenta mezclada (pesos y unidades, tres tasas)", mezcla, 0);
  revisar("con un descuento de 10.000", mezcla, 10000);
  const subM = mezcla.lineas.reduce((s, l) => s + l.precioUnitario * l.cantidad, 0);
  const porc = dv.calcularDescuento(subM, { tipo: "porcentaje", valor: 7.5 });
  ok(porc.ok && esEntero(porc.monto), "un descuento del 7,5 % sobre lo pesado da un monto entero (" + (porc.ok ? porc.monto : "?") + ")");
  revisar("con un descuento del 7,5 %", mezcla, porc.ok ? porc.monto : 0);

  // una promoción del 20 % sobre un producto pesado
  const todaLaSemana = [0, 1, 2, 3, 4, 5, 6].map((d) => ({ diaInicio: d, horaInicio: "00:00:00", diaFin: d, horaFin: "23:59:59" }));
  const promo = { id: "pr1", nombre: "PROMO 20", tipo: "descuento", activa: true, porcentaje: 20, porCada: null, regalar: null, forzarPorProducto: false, aplicaAModificadores: false, franjas: todaLaSemana, productIds: ["k10", "k5"] };
  const pos = ps.segundoDeSemanaAsuncion(Date.now());
  const conPromo = pr.aplicarPromociones(mezcla.lineas, [promo], pos);
  ok(conPromo.lineas.every((l) => esEntero(l.precioUnitario)) && esEntero(conPromo.ahorro) && conPromo.ahorro > 0, `la promoción del 20 % deja cada línea en guaraníes enteros (ahorro ${conPromo.ahorro})`);
  const dPromo = fp.desglosarIva(conPromo.lineas, 0);
  const totalPromo = conPromo.lineas.reduce((s, l) => s + l.precioUnitario * l.cantidad, 0);
  ok(dPromo.totalGeneral === totalPromo && totalPromo === subM - conPromo.ahorro, "el total con promoción es el de lista menos el ahorro, y el IVA suma exacto");

  // una barrida con miles de cuentas al azar: ninguna rompe las cuentas
  let semilla = 12345;
  const azar = (n) => { semilla = (semilla * 1103515245 + 12345) % 2147483648; return semilla % n; };
  const ivas = ["gravado10", "gravado5", "exento"];
  let cuentas = 0, falladas = 0;
  for (let i = 0; i < 1500; i++) {
    const lineas = Array.from({ length: 1 + azar(5) }, (_, k) => ({ id: "z" + k, iva: ivas[azar(3)], precio: 100 + azar(150000), peso: (1 + azar(4999)) / 1000, cantidad: 1 + azar(4) }));
    const carta = lineas.map((l) => producto({ id: l.id, nombre: "P" + l.id, precio: l.precio, iva: l.iva }));
    const a = pp.armarPedido(carta, lineas.map((l) => ({ productId: l.id, cantidad: l.cantidad, peso: l.peso })), pp.LIMITES_DE_CAJA);
    cuentas++;
    if (!a.ok) { falladas++; continue; }
    const subtotal = a.lineas.reduce((s, l) => s + l.precioUnitario * l.cantidad, 0);
    const descuento = azar(3) === 0 ? 0 : azar(Math.max(1, Math.floor(subtotal / 3)));
    const d = fp.desglosarIva(a.lineas, descuento);
    const bien =
      a.lineas.every((l) => esEntero(l.precioUnitario)) &&
      [d.gravado10, d.gravado5, d.exento, d.iva10, d.iva5, d.totalGeneral].every(esEntero) &&
      d.gravado10 + d.gravado5 + d.exento === d.totalGeneral &&
      d.totalGeneral === subtotal - descuento;
    if (!bien) falladas++;
  }
  ok(falladas === 0, `${cuentas} cuentas al azar con pesos y descuento: el IVA y el total cierran al guaraní en todas (${falladas} con problemas)`);

  // =============================================================== la cantidad que se escribe antes de tocar el producto
  window.log("== Cantidad escrita: «0.250» NO es 250 unidades");
  const ce = await C.cargar("src/lib/cantidad-escrita");
  const leer = ce.leerCantidadEscrita;
  igual(leer("").tipo, "vacia", "vacío = sin cantidad (suma de a uno)");
  igual(leer("   ").tipo, "vacia", "solo espacios = sin cantidad");
  igual(leer("35"), { tipo: "entera", valor: 35 }, "35 son 35 unidades");
  igual(leer("0.250"), { tipo: "decimal", valor: 0.25 }, "0.250 es el decimal 0,25 (NUNCA 250 unidades)");
  igual(leer("0,250"), { tipo: "decimal", valor: 0.25 }, "0,250 con coma es lo mismo");
  igual(leer(".25"), { tipo: "decimal", valor: 0.25 }, ".25 es 0,25");
  igual(leer("0,285"), { tipo: "decimal", valor: 0.285 }, "0,285 (lo que marca una balanza)");
  igual(leer("1,5"), { tipo: "decimal", valor: 1.5 }, "1,5");
  igual(leer("2,000"), { tipo: "entera", valor: 2 }, "2,000 es el entero 2");
  igual(leer("1000"), { tipo: "entera", valor: 1000 }, "1000");
  for (const malo of ["abc", "0", "0,0", "0,000", "-1", "1e3", "35 unidades", "1,2,3", "1.2.3", "0,0004", "0,2501", ",", ".", "99999999", "$5"]) {
    ok(leer(malo).tipo === "invalida" && typeof leer(malo).error === "string", `«${malo}» se rechaza con un aviso`);
  }
  const porUnidad = { nombre: "Pizza Grande", porPeso: false };
  const porKilo = { nombre: "Comida por kilo", porPeso: true };
  const carga = (texto, producto) => ce.cargaDeProducto(leer(texto), producto);
  igual(carga("", porUnidad), { ok: true, cantidad: 1 }, "sin escribir nada: 1 unidad");
  igual(carga("", porKilo), { ok: true, cantidad: 1 }, "sin escribir nada en uno por kilo: 1 kilo, como siempre");
  igual(carga("35", porUnidad), { ok: true, cantidad: 35 }, "35 en un producto por unidad: 35 unidades");
  const decimalEnUnidad = carga("0.250", porUnidad);
  ok(!decimalEnUnidad.ok && decimalEnUnidad.error.includes("unidad") && decimalEnUnidad.error.includes("Kilogramo"), "0.250 en un producto por unidad NO carga 250: avisa que se vende por unidad y cómo cambiarlo");
  igual(carga("0,285", porKilo), { ok: true, cantidad: 1, peso: 0.285 }, "0,285 en uno por kilo: una porción de 285 g");
  igual(carga("0.250", porKilo), { ok: true, cantidad: 1, peso: 0.25 }, "0.250 en uno por kilo: 250 g");
  igual(carga("2", porKilo), { ok: true, cantidad: 1, peso: 2 }, "2 en uno por kilo: 2 kilos");
  const demasiado = carga("250", porKilo);
  ok(!demasiado.ok && demasiado.error.includes("0,250"), "250 en uno por kilo se frena (¿eran 250 g?) y dice cómo escribir gramos");
  igual(carga("50", porKilo), { ok: true, cantidad: 1, peso: 50 }, "50 kilos todavía se cargan");
  ok(!carga("50,5", porKilo).ok, "50,5 kilos de una vez no");
  ok(!carga("1001", porUnidad).ok, "1001 unidades de una vez no");
  igual(carga("1000", porUnidad), { ok: true, cantidad: 1000 }, "1000 unidades sí");
  ok(!carga("abc", porKilo).ok, "letras no");
  igual(ce.sumarPesos(0.1, 0.2), 0.3, "0,1 + 0,2 = 0,3 justo (sin 0,30000000000000004)");
  igual(ce.sumarPesos(0.285, 0.715), 1, "0,285 + 0,715 = 1");
  igual(ce.sumarPesos(0.25, 0.25), 0.5, "dos veces 0,250 son 0,500");
  // el caso del dueño: la balanza dice 0,285 y el producto vale 60.000 el kilo → 17.100
  igual(um.montoPorPeso(60000, 0.285), 17100, "0,285 kg a 60.000 el kilo = 17.100");
  const kilo = pp.armarPedido([producto({ id: "p-buffet", nombre: "Buffet", precio: 60000 })], [{ productId: "p-buffet", cantidad: 1, peso: 0.285 }], pp.LIMITES_DE_CAJA);
  ok(kilo.ok && kilo.subtotal === 17100 && kilo.lineas[0].nombreProducto === "Buffet (285 g)", "el servidor cobra 17.100 y la línea dice «Buffet (285 g)»");
  const ivaKilo = fp.desglosarIva(kilo.lineas, 0);
  ok(ivaKilo.totalGeneral === 17100 && ivaKilo.gravado10 === 17100 && ivaKilo.iva10 === Math.round(17100 / 11), "el IVA de esos 17.100 es 1.555 (÷ 11) y el total cierra");

  window.log("\naciertos: " + window.__aciertos + " · fallas: " + window.__fallas);
  window.__listo = true;
})().catch((e) => { document.getElementById("salida").textContent += "\nERROR: " + (e && e.stack || e); window.__listo = true; window.__fallas = (window.__fallas || 0) + 1; });
