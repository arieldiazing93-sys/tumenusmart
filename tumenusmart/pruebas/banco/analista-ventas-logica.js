// El analista comercial (Ideas) con las funciones REALES: lee las ventas de TODOS los puntos donde se vende (mostrador, comedor, delivery, turnos y
// canchas entran por el punto de venta), no cuenta lo cancelado ni las líneas de envío, y lo que dice arriba que analiza coincide con lo que el
// código puede emitir.
(async () => {
  const C = window.Cargador; const { ok, igual } = window;
  const V = await C.cargar("src/lib/ventas-para-analisis");
  const A = await C.cargar("src/lib/analista");

  const ahora = new Date("2026-10-18T15:00:00Z");
  // Un instante: `atras` días antes de hoy, a la `hora` de Asunción (UTC-3 todo el año).
  const instante = (atras, hora) => new Date(Date.UTC(2026, 9, 18 - atras, hora + 3, 0, 0));

  // ------------------------------------------------------------------------------------------ los productos del local
  const prod = (id, nombre, precio, costo, extra = {}) => ({ id, nombre, categoryId: extra.cat ?? "c-" + id, category: { nombre: extra.catNombre ?? nombre, activa: extra.activa ?? true }, precio, costo, receta: [], iva: "gravado10", disponible: true, createdAt: new Date(ahora.getTime() - 200 * 86400000), ...extra.resto });
  const crudos = [
    prod("pizza", "Pizza", 50000, 20000, { cat: "comida", catNombre: "Comidas" }),
    prod("cerveza", "Cerveza", 12000, 4000, { cat: "bebida", catNombre: "Bebidas" }),
    prod("agua", "Agua", 3000, 1000, { cat: "bebida", catNombre: "Bebidas" }),
    prod("corte", "Corte de pelo", 40000, 5000, { cat: "servicios", catNombre: "Servicios" }),
    prod("barba", "Arreglo de barba", 25000, 3000, { cat: "servicios", catNombre: "Servicios" }),
    prod("cancha1", "Alquiler Cancha 1", 100000, 10000, { cat: "canchas", catNombre: "Fútbol 5" }),
    prod("cancha2", "Alquiler Cancha 2", 100000, 10000, { cat: "canchas", catNombre: "Fútbol 5" }),
    prod("masaje", "Masaje", 90000, 15000, { cat: "servicios", catNombre: "Servicios" }),
    prod("viejo", "Producto escondido", 9000, 3000, { cat: "oculta", catNombre: "Categoría desactivada", activa: false }),
  ];

  // ------------------------------------------------------------------------------------------ las ventas de cada punto
  let cuenta = 0;
  const venta = ({ atras, hora, tipoEntrega = "local", items, telefono = null, nombre = null, cancelada = false, nota = null }) => ({
    id: "v" + ++cuenta, creadoEn: instante(atras, hora), tipoEntrega, cancelada, nota,
    total: items.reduce((s, i) => s + i.precioUnitario * i.cantidad, 0), clienteNombre: nombre, clienteTelefono: telefono,
    items: items.map((i) => ({ productId: i.productId ?? null, nombreProducto: i.nombre, cantidad: i.cantidad, precioUnitario: i.precioUnitario, esEnvio: i.esEnvio === true })),
  });
  const L = (id, nombre, precio, cantidad = 1) => ({ productId: id, nombre, precioUnitario: precio, cantidad });
  const horas = [19, 19, 19, 19, 20, 20, 20, 20, 21, 21, 21, 21, 12, 12, 12, 15, 15, 17, 10, 22];
  const ventas = [];
  for (let i = 0; i < 160; i++) {
    const hora = horas[i % horas.length]; const atras = (i * 7) % 100;
    const k = i % 8;
    if (k === 0 || k === 1) ventas.push(venta({ atras, hora, items: [L("pizza", "Pizza", 50000), L("cerveza", "Cerveza", 12000)], telefono: i % 5 === 0 ? "0981" + String(100000 + i % 20) : null }));                                // mostrador
    else if (k === 2) ventas.push(venta({ atras, hora, items: [L("pizza", "Pizza", 50000, 2)], nota: "Mesa 5 · Cuenta #" + i }));                                                                                                  // comedor
    else if (k === 3) ventas.push(venta({ atras, hora, tipoEntrega: "delivery", items: [L("pizza", "Pizza", 50000, 2), { productId: null, nombre: "Costo de envío", precioUnitario: 15000, cantidad: 1, esEnvio: true }], telefono: "0982" + String(100000 + i % 30), nombre: "Cliente " + (i % 30) }));
    else if (k === 4) ventas.push(venta({ atras, hora, tipoEntrega: "llevar", items: [L("pizza", "Pizza", 50000)] }));                                                                                                                // para llevar
    else if (k === 5) ventas.push(venta({ atras, hora, items: [L("corte", "Corte de pelo", 40000), L("barba", "Arreglo de barba", 25000)], telefono: "0983" + String(100000 + i % 25), nombre: "Cliente turno " + (i % 25) }));      // turno cobrado
    else if (k === 6) ventas.push(venta({ atras, hora, items: [L("cancha1", "Alquiler Cancha 1 · 20:00–21:30", 150000)], telefono: "0984" + String(100000 + i % 12) }));                                                              // cancha cobrada
    else ventas.push(venta({ atras, hora, items: [L("agua", "Agua", 3000)] }));
  }
  const canceladas = [venta({ atras: 3, hora: 20, items: [L("pizza", "Pizza", 50000)], cancelada: true }), venta({ atras: 5, hora: 20, items: [L("corte", "Corte de pelo", 40000)], cancelada: true })];
  const todas = [...ventas, ...canceladas];

  const db = { ventaPos: { findMany: async ({ where, take }) => todas.filter((v) => v.creadoEn >= where.creadoEn.gte).sort((a, b) => b.creadoEn - a.creadoEn).slice(0, take) } };
  const desde = new Date(ahora.getTime() - 180 * 86400000);

  // ------------------------------------------------------------------------------------------ las ventas que lee el analista
  window.log("== De dónde salen las ventas");
  const leidas = await V.cargarVentasParaAnalisis(db, desde, 3000);
  ok(leidas.length === todas.length, "entran TODAS las ventas del período: " + leidas.length + " de " + todas.length);
  const porTipo = (t) => leidas.filter((p) => p.tipoEntrega === t && p.estado !== "cancelado").length;
  ok(porTipo("mesa") > 0 && porTipo("delivery") > 0 && porTipo("retiro") > 0, "hay ventas de mostrador/comedor/turnos/canchas (en el local), de delivery y de para llevar");
  ok(leidas.filter((p) => p.items.some((i) => i.productId === "corte")).length > 0 && leidas.filter((p) => p.items.some((i) => i.productId === "cancha1")).length > 0, "entran las citas cobradas (servicios) y las canchas cobradas (alquileres)");
  ok(leidas.filter((p) => p.estado === "cancelado").length === 2, "las canceladas entran marcadas como «cancelado»");
  const conEnvio = leidas.find((p) => p.tipoEntrega === "delivery");
  ok(conEnvio.costoEnvio === 15000 && conEnvio.items.every((i) => i.nombre !== "Costo de envío"), "el envío suma al costo de envío y NO es un producto de la venta");
  ok(leidas.some((p) => p.clienteTelefono === "") && leidas.some((p) => p.clienteTelefono !== ""), "una venta sin teléfono queda con el teléfono vacío (no es un cliente a seguir)");

  // ------------------------------------------------------------------------------------------ el análisis
  window.log("== El análisis");
  const elaborados = new Map();
  const productos = crudos.map((pr) => V.productoParaAnalisis(pr, elaborados));
  const reales = ventas.length;
  const r = A.analizar({ pedidos: leidas, productos, ahora, zona: "America/Asuncion" });
  ok(r.faltaData === null && r.base === reales, "analiza todas las ventas no canceladas de todos los puntos: " + r.base + " de " + reales);
  const resumen = r.ideas.find((i) => i.clave === "resumen");
  ok(resumen && resumen.dato.startsWith(reales + " ventas,"), "el resumen cuenta ventas, no pedidos → " + (resumen && resumen.dato));
  const dormidos = r.ideas.find((i) => i.clave === "dormidos");
  const nombresDormidos = (dormidos?.detalle ?? []).map((d) => d.etiqueta);
  ok(nombresDormidos.includes("Alquiler Cancha 2") && nombresDormidos.includes("Masaje"), "una cancha que nadie alquiló y un servicio que nadie compró figuran como «casi no se venden» → " + JSON.stringify(nombresDormidos));
  ok(!nombresDormidos.includes("Producto escondido"), "un producto de una categoría desactivada (no se ofrece en ningún lado) NO figura como «no se vende»");
  ok(!nombresDormidos.includes("Alquiler Cancha 1") && !nombresDormidos.includes("Corte de pelo"), "lo que sí se vende (cancha 1, cortes) no figura");
  ok(dormidos && /productos y servicios/.test(dormidos.dato) && !/carta/i.test(dormidos.titulo), "los textos no hablan de «carta» ni de «pedidos» donde no corresponde");
  ok(r.ideas.every((i) => !/pedid/i.test(i.titulo + " " + i.dato + " " + i.accion)), "ninguna idea habla de «pedidos»: son ventas → " + r.ideas.map((i) => i.clave).join(", "));
  ok(r.ideas.every((i) => !/cocina|plato|preparaci/i.test(i.titulo + " " + i.accion)), "los consejos no suponen una cocina (sirven igual a un salón o a un complejo de canchas)");

  // ------------------------------------------------------------------------------------------ la leyenda
  window.log("== Lo que dice que analiza");
  const clavesDeLaLeyenda = A.QUE_ANALIZA.flatMap((q) => q.claves);
  const posibles = ["resumen", "franja", "dia", "dormidos", "combo", "categoria_ausente", "clientes_perdidos", "clientes_fieles", "margen", "delivery_retiro"];
  ok(posibles.every((c) => clavesDeLaLeyenda.includes(c)), "cada idea que el analista puede emitir figura en la leyenda de arriba → faltan: " + posibles.filter((c) => !clavesDeLaLeyenda.includes(c)).join(", "));
  ok(!clavesDeLaLeyenda.includes("abandono"), "la leyenda no promete los carritos abandonados (las ventas del punto de venta siempre están enviadas)");
  ok(r.ideas.every((i) => clavesDeLaLeyenda.includes(i.clave)), "lo que se emitió en este caso está todo en la leyenda");
  ok(r.ideas.length >= 4, "este caso de prueba emite varias ideas (" + r.ideas.length + "), no pasa por casualidad");
  ok(A.QUE_ANALIZA.every((q) => q.texto && q.claves.length > 0) && /canchas/.test(A.FUENTES_DEL_ANALISIS) && /turnos/.test(A.FUENTES_DEL_ANALISIS) && /delivery/.test(A.FUENTES_DEL_ANALISIS) && /comedor/.test(A.FUENTES_DEL_ANALISIS), "la leyenda nombra los puntos de venta: mostrador, comedor, delivery, turnos y canchas");

  // ------------------------------------------------------------------------------------------ con pocas ventas
  window.log("== Con pocas ventas");
  const pocas = A.analizar({ pedidos: leidas.filter((p) => p.estado !== "cancelado").slice(0, 12), productos, ahora, zona: "America/Asuncion" });
  ok(pocas.faltaData && pocas.faltaData.pedidosActuales === 12 && pocas.faltaData.pedidosNecesarios === A.MINIMO_PARA_OPINAR && pocas.ideas.length === 0, "con 12 ventas no se inventa nada y dice cuántas faltan (" + A.MINIMO_PARA_OPINAR + ")");

  window.log("\naciertos: " + window.__aciertos + " · fallas: " + window.__fallas);
  window.__listo = true;
})().catch((e) => { document.getElementById("salida").textContent += "\nERROR: " + (e && e.stack || e); window.__listo = true; window.__fallas = (window.__fallas || 0) + 1; });
