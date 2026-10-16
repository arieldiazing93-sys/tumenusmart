// Prueba de los códigos de barras: el dígito verificador, qué se acepta guardar, el EAN-13 propio, el dibujo de las barras (contra JsBarcode, una
// librería independiente que hace de juez), las medidas de la etiqueta según la impresora, el reparto en hojas y el reconocimiento del lector
// por la velocidad con que llegan las teclas.
(async () => {
  const { ok, igual } = window;
  const c = await window.Cargador.cargar("src/lib/codigo-barras");
  const e = await window.Cargador.cargar("src/lib/etiqueta-barras");
  const l = await window.Cargador.cargar("src/lib/lector-codigo");

  // ------------------------------------------------------------------ dígito verificador
  window.log("== Dígito verificador");
  // Un cálculo APARTE (pesos de izquierda a derecha) para no probar la función con ella misma.
  const verificadorIzquierda = (cuerpo) => {
    // EAN-13 (cuerpo de 12): 1,3,1,3…; EAN-8 (cuerpo de 7): 3,1,3,1…; UPC-A (cuerpo de 11): 3,1,3,1…
    const empiezaEn3 = cuerpo.length % 2 === 1;
    let s = 0;
    for (let i = 0; i < cuerpo.length; i++) s += Number(cuerpo[i]) * ((i % 2 === 0) === empiezaEn3 ? 3 : 1);
    return (10 - (s % 10)) % 10;
  };
  for (const cod of ["4006381333931", "5901234123457", "96385074", "036000291452", "7501031311309", "0012345678905"]) {
    ok(c.esGs1Valido(cod), "«" + cod + "» es un código válido");
  }
  ok(!c.esGs1Valido("4006381333930") && !c.esGs1Valido("5901234123458") && !c.esGs1Valido("96385075") && !c.esGs1Valido("036000291453"), "con el último dígito cambiado ya no es válido");
  ok(!c.esGs1Valido("123456789") && !c.esGs1Valido("ABC1234567890") && !c.esGs1Valido(""), "otro largo o con letras: no es un EAN/UPC");
  let discrepancias = 0;
  for (let i = 0; i < 4000; i++) {
    const largo = [12, 7, 11][i % 3];
    let cuerpo = "";
    for (let k = 0; k < largo; k++) cuerpo += Math.floor(Math.random() * 10);
    if (c.digitoVerificadorGs1(cuerpo) !== verificadorIzquierda(cuerpo)) discrepancias++;
  }
  ok(discrepancias === 0, "el dígito verificador coincide con un cálculo aparte en 4.000 códigos al azar (discrepancias: " + discrepancias + ")");

  // ------------------------------------------------------------------ qué se guarda
  window.log("== Lo que se acepta guardar");
  igual(c.limpiarCodigo("  7790001234567\r\n"), "7790001234567", "se sacan los espacios y los saltos de línea");
  igual(c.limpiarCodigo("abc-123"), "ABC-123", "las letras van en mayúscula (un lector con el bloqueo cambiado no crea otro código)");
  igual(c.validarCodigoDeBarras("5901234123457"), { ok: true, codigo: "5901234123457" }, "un EAN-13 válido");
  igual(c.validarCodigoDeBarras(" prod-0042 "), { ok: true, codigo: "PROD-0042" }, "un código con letras y guion");
  igual(c.validarCodigoDeBarras("1234567"), { ok: true, codigo: "1234567" }, "7 números: no es un EAN, se acepta como código propio de otro sistema");
  ok(!c.validarCodigoDeBarras("").ok && !c.validarCodigoDeBarras("12").ok, "vacío y demasiado corto: no");
  ok(!c.validarCodigoDeBarras("X".repeat(41)).ok && c.validarCodigoDeBarras("X".repeat(40)).ok, "hasta 40 caracteres");
  ok(!c.validarCodigoDeBarras("AB C123").ok && !c.validarCodigoDeBarras("12*34*56").ok, "con espacios adentro o símbolos raros: no");
  const malo = c.validarCodigoDeBarras("5901234123458");
  ok(!malo.ok && /verificador/.test(malo.error), "un EAN-13 con el verificador mal se rechaza y dice por qué: " + (malo.error || ""));
  ok(!c.validarCodigoDeBarras("036000291453").ok && !c.validarCodigoDeBarras("96385075").ok, "también el UPC-A y el EAN-8");
  igual(c.variantesDeCodigo("036000291452"), ["036000291452", "0036000291452"], "un UPC-A de 12 dígitos también se busca como EAN-13 con un 0 adelante");
  igual(c.variantesDeCodigo("0036000291452"), ["0036000291452", "036000291452"], "y al revés");
  igual(c.variantesDeCodigo("5901234123457"), ["5901234123457"], "un EAN-13 común no tiene otra forma");

  // ------------------------------------------------------------------ códigos propios
  window.log("== Códigos propios (EAN-13 que empieza con 2)");
  igual(c.generarEan13Interno(1), "2000000000015", "el primero");
  igual(c.generarEan13Interno(42), "2000000000425".slice(0, 12) + verificadorIzquierda("200000000042"), "el 42 (con su verificador aparte)");
  let internosMal = 0;
  const vistos = new Set();
  for (let n = 1; n <= 3000; n++) {
    const cod = c.generarEan13Interno(n);
    if (cod.length !== 13 || cod[0] !== "2" || !c.esGs1Valido(cod) || !c.esCodigoInterno(cod) || Number(cod.slice(1, 12)) !== n || vistos.has(cod)) internosMal++;
    vistos.add(cod);
  }
  ok(internosMal === 0, "los primeros 3.000: 13 dígitos, empiezan con 2, verificador bien, correlativos y sin repetirse (mal: " + internosMal + ")");
  ok(c.generarEan13Interno(99999999999).length === 13, "llega hasta el 99.999.999.999");
  for (const n of [0, -1, 1.5, 100000000000, NaN]) {
    let lanzo = false;
    try { c.generarEan13Interno(n); } catch { lanzo = true; }
    ok(lanzo, "el número " + n + " no es válido");
  }
  ok(!c.esCodigoInterno("4006381333931") && !c.esCodigoInterno("2000000000016") && c.esCodigoInterno("2000000000008"), "solo es propio el que empieza con 2 y tiene el verificador bien");

  // ------------------------------------------------------------------ las barras
  window.log("== Las barras (contra JsBarcode)");
  const aleatorio = (largo) => { let s = ""; for (let i = 0; i < largo; i++) s += Math.floor(Math.random() * 10); return s; };
  const ean13 = () => { const cuerpo = aleatorio(12); return cuerpo + c.digitoVerificadorGs1(cuerpo); };
  const ean8 = () => { const cuerpo = aleatorio(7); return cuerpo + c.digitoVerificadorGs1(cuerpo); };
  let largosMal = 0;
  for (let i = 0; i < 500; i++) {
    const p = c.patronEan13(ean13());
    if (p.length !== 95 || !p.startsWith("101") || p.slice(45, 50) !== "01010" || !p.endsWith("101")) largosMal++;
    const q = c.patronEan8(ean8());
    if (q.length !== 67 || !q.startsWith("101") || q.slice(31, 36) !== "01010" || !q.endsWith("101")) largosMal++;
  }
  ok(largosMal === 0, "EAN-13 de 95 módulos y EAN-8 de 67, con sus guardas de inicio, medio y final en su lugar (mal: " + largosMal + ")");
  if (typeof window.JsBarcode === "function") {
    const codificar = (formato, texto) => { const o = {}; window.JsBarcode(o, texto, { format: formato, flat: true }); return o.encodings && o.encodings[0] && o.encodings[0].data; };
    const prueba = codificar("EAN13", "5901234123457");
    if (!prueba) {
      window.log("(JsBarcode no entregó las barras como objeto: se salta la comparación)");
    } else {
      igual(c.patronEan13("5901234123457"), prueba, "EAN-13 de ejemplo igual al de JsBarcode");
      let distintos = 0;
      for (let i = 0; i < 2500; i++) {
        const cod = ean13();
        if (c.patronEan13(cod) !== codificar("EAN13", cod)) distintos++;
      }
      ok(distintos === 0, "2.500 EAN-13 al azar: las barras coinciden con las de JsBarcode (distintos: " + distintos + ")");
      let distintos8 = 0;
      for (let i = 0; i < 1000; i++) {
        const cod = ean8();
        if (c.patronEan8(cod) !== codificar("EAN8", cod)) distintos8++;
      }
      ok(distintos8 === 0, "1.000 EAN-8 al azar: coinciden con JsBarcode (distintos: " + distintos8 + ")");
      let distintosUpc = 0;
      for (let i = 0; i < 500; i++) {
        const cuerpo = aleatorio(11);
        const upc = cuerpo + c.digitoVerificadorGs1(cuerpo);
        const mio = c.barrasDeCodigo(upc);
        if (!mio || mio.tipo !== "ean13" || mio.digitos !== "0" + upc || mio.bits !== codificar("UPC", upc)) distintosUpc++;
      }
      ok(distintosUpc === 0, "500 UPC-A al azar: son el EAN-13 con un 0 adelante y coinciden con el UPC de JsBarcode (distintos: " + distintosUpc + ")");
    }
  } else {
    window.log("(sin JsBarcode: no se pudo cargar; se salta la comparación con la librería independiente)");
  }
  ok(c.barrasDeCodigo("5901234123458") === null && c.barrasDeCodigo("PROD-1") === null && c.barrasDeCodigo("1234567") === null, "un código que no es EAN/UPC válido no se dibuja");
  ok(c.sePuedeImprimir("5901234123457") && c.sePuedeImprimir("96385074") && !c.sePuedeImprimir(null) && !c.sePuedeImprimir("PROD-1"), "sePuedeImprimir");
  // Las barras agrupadas dan los mismos módulos que el patrón.
  let reconstruidasMal = 0;
  for (let i = 0; i < 300; i++) {
    for (const cod of [ean13(), ean8()]) {
      const b = c.barrasDeCodigo(cod);
      const bits = Array(b.bits.length).fill("0");
      let guardasBien = true;
      for (const barra of c.barrasDelSimbolo(b)) {
        for (let x = barra.x; x < barra.x + barra.ancho; x++) bits[x] = "1";
        const zonas = b.tipo === "ean13" ? [[0, 2], [45, 49], [92, 94]] : [[0, 2], [31, 35], [64, 66]];
        const enGuarda = zonas.some(([d, h]) => barra.x >= d && barra.x + barra.ancho - 1 <= h);
        if (barra.guarda !== enGuarda) guardasBien = false;
      }
      if (bits.join("") !== b.bits || !guardasBien) reconstruidasMal++;
    }
  }
  ok(reconstruidasMal === 0, "las barras agrupadas reconstruyen exactamente los módulos y solo las de guarda están marcadas (mal: " + reconstruidasMal + ")");
  igual(c.barrasDelSimbolo(c.barrasDeCodigo("5901234123457")).filter((b) => b.guarda).length, 6, "un EAN-13 tiene 6 barras de guarda (2 de inicio, 2 del medio y 2 del final)");

  // ------------------------------------------------------------------ medidas según la impresora
  window.log("== Medidas de la etiqueta");
  const m50 = c.medirBarras("ean13", 48.8, 203);
  ok(m50.ok && m50.puntos === 3 && Math.abs(m50.moduloMm - 3 * 25.4 / 203) < 1e-9 && m50.advertencia === null, "50 mm en una térmica de 203 ppp: 3 puntos por barra (0,375 mm), sin advertencia");
  const m40 = c.medirBarras("ean13", 38.8, 203);
  ok(m40.ok && m40.puntos === 2 && m40.advertencia && /80 %/.test(m40.advertencia), "40 mm a 203 ppp: 2 puntos (0,25 mm), justo: avisa que sale chico");
  const m40b = c.medirBarras("ean13", 38.8, 300);
  ok(m40b.ok && m40b.puntos === 4 && m40b.advertencia === null, "40 mm a 300 ppp: 4 puntos, sin advertencia (" + (m40b.puntos) + ")");
  const mAngosta = c.medirBarras("ean13", 24, 203);
  ok(!mAngosta.ok && /angosta/.test(mAngosta.error), "24 mm a 203 ppp: no entra (menos de 2 puntos por barra)");
  ok(c.medirBarras("ean8", 24, 203).ok === true, "un EAN-8 es más corto: en 24 mm sí entra");
  ok(!c.medirBarras("ean13", 0, 203).ok && !c.medirBarras("ean13", 40, 0).ok, "sin medidas no se calcula");
  let desalineadas = 0;
  for (const dpi of [203, 300, 600]) {
    for (let ancho = 25; ancho <= 100; ancho += 0.5) {
      const r = c.medirBarras("ean13", ancho, dpi);
      if (!r.ok) continue;
      const puntos = r.moduloMm / (25.4 / dpi);
      if (Math.abs(puntos - Math.round(puntos)) > 1e-9) desalineadas++;
      if (r.moduloMm * 113 > ancho + 1e-9) desalineadas++;
    }
  }
  ok(desalineadas === 0, "el ancho de cada barra es siempre un número ENTERO de puntos de la impresora y el código nunca se pasa del ancho (mal: " + desalineadas + ")");

  window.log("== Diseño de la etiqueta");
  const base = { dpi: 203, verNombre: true, verPrecio: true, verNumeros: true, tipoBarras: "ean13" };
  const d50 = e.disenarEtiqueta({ ...base, ancho: 50, alto: 30 });
  ok(d50.ok && d50.puntosPorModulo === 3 && d50.altoBarrasMm >= 8 && d50.lineasNombre === 2 && d50.advertencias.length === 0, "50 × 30 con todo: barras de 3 puntos y alto cómodo (" + (d50.ok && d50.altoBarrasMm.toFixed(1)) + " mm)");
  const d40 = e.disenarEtiqueta({ ...base, ancho: 40, alto: 25 });
  ok(d40.ok && d40.lineasNombre === 1 && d40.advertencias.length === 1 && d40.altoBarrasMm >= 6, "40 × 25: nombre en una línea y avisa que las barras salen justas");
  const d15 = e.disenarEtiqueta({ ...base, ancho: 40, alto: 15 });
  ok(!d15.ok && /baja/.test(d15.error), "40 × 15 con nombre, precio y números: muy baja, lo dice");
  ok(e.disenarEtiqueta({ ...base, ancho: 40, alto: 15, verNombre: false, verPrecio: false }).ok, "…pero con solo el código entra");
  ok(!e.disenarEtiqueta({ ...base, ancho: 10, alto: 30 }).ok && !e.disenarEtiqueta({ ...base, ancho: 50, alto: 5 }).ok && !e.disenarEtiqueta({ ...base, ancho: 500, alto: 30 }).ok, "tamaños fuera de rango");
  ok(!e.disenarEtiqueta({ ...base, ancho: Number("abc"), alto: 30 }).ok, "un ancho que no es número no se acepta");
  igual(e.tipoDeBarrasDe("5901234123457"), "ean13", "tipo de barras de un EAN-13");
  igual(e.tipoDeBarrasDe("96385074"), "ean8", "tipo de barras de un EAN-8");
  igual(e.tipoDeBarrasDe("PROD-1"), null, "un código raro no tiene");
  for (const f of e.FORMATOS_DE_ETIQUETA) {
    const r = e.disenarEtiqueta({ ...base, ancho: f.ancho, alto: f.alto, dpi: f.tipo === "hoja" ? 600 : 203 });
    ok(r.ok, "el formato «" + f.nombre + "» se puede diseñar" + (r.ok ? "" : ": " + r.error));
    if (f.tipo === "hoja") ok((f.columnas * f.ancho) <= 210 && (f.filas * f.alto) <= 297, "«" + f.nombre + "» entra en una hoja A4");
  }

  window.log("== Reparto en hojas");
  const rollo = { tipo: "rollo" };
  const hoja = { tipo: "hoja", columnas: 3, filas: 8 };
  const doce = Array.from({ length: 12 }, (_, i) => i + 1);
  igual(e.repartirEnPaginas(doce, rollo).length, 12, "en un rollo, una etiqueta por página");
  igual(e.etiquetasPorHoja(hoja), 24, "3 × 8 = 24 por hoja");
  igual(e.etiquetasPorHoja(rollo), 0, "un rollo no tiene hojas");
  const treinta = Array.from({ length: 30 }, (_, i) => i + 1);
  const hojas = e.repartirEnPaginas(treinta, hoja);
  ok(hojas.length === 2 && hojas[0].length === 24 && hojas[1].length === 6, "30 etiquetas: una hoja llena y otra con 6");
  const desde5 = e.repartirEnPaginas(treinta, hoja, 5);
  ok(desde5[0].slice(0, 4).every((x) => x === null) && desde5[0][4] === 1 && desde5[0].length === 24 && desde5[1].length === 10, "empezando en la etiqueta 5: las 4 primeras quedan en blanco y las 30 siguen (10 en la segunda hoja)");
  ok(e.repartirEnPaginas([1], hoja, 999)[0].length === 24 && e.repartirEnPaginas([1], hoja, 999)[0][23] === 1, "un «empezar en» pasado de largo se acota a la última etiqueta de la hoja");
  igual(e.repartirEnPaginas([], hoja).length, 0, "sin etiquetas no hay hojas");

  // ------------------------------------------------------------------ el lector
  window.log("== El lector (por la velocidad de las teclas)");
  const teclear = (det, texto, desdeMs, pasoMs, final = "Enter") => {
    let t = desdeMs, ultimo = null;
    for (const ch of texto) { ultimo = det.tecla(ch, t); t += pasoMs; }
    return { ultimo, fin: det.tecla(final, t) };
  };
  let det = l.crearDetectorDeEscaneo();
  igual(teclear(det, "7790001234567", 1000, 12).fin, { tipo: "escaneo", codigo: "7790001234567" }, "un lector (12 ms entre números) y Enter: es un escaneo");
  det = l.crearDetectorDeEscaneo();
  igual(teclear(det, "7790001234567", 1000, 150).fin, { tipo: "enter_comun" }, "una persona escribiendo (150 ms entre números): no");
  det = l.crearDetectorDeEscaneo();
  igual(teclear(det, "7790001234567", 1000, 61).fin, { tipo: "enter_comun" }, "a 61 ms entre números (justo arriba del límite): no");
  det = l.crearDetectorDeEscaneo();
  igual(teclear(det, "7790001234567", 1000, 60).fin, { tipo: "escaneo", codigo: "7790001234567" }, "a 60 ms (el límite): sí");
  det = l.crearDetectorDeEscaneo();
  igual(teclear(det, "12", 1000, 10).fin, { tipo: "enter_comun" }, "dos números rápidos y Enter: es una persona (un código tiene al menos 4)");
  det = l.crearDetectorDeEscaneo();
  igual(det.tecla("Enter", 5000), { tipo: "enter_comun" }, "un Enter solo es una tecla común");
  det = l.crearDetectorDeEscaneo();
  igual(teclear(det, "ABC-123", 1000, 8, "Tab").fin, { tipo: "escaneo", codigo: "ABC-123" }, "un lector que termina con Tab también se reconoce");
  // Un lector con letras manda un Shift antes de cada mayúscula: no tiene que cortar la ráfaga.
  det = l.crearDetectorDeEscaneo();
  let t = 1000;
  for (const ch of "AB12") { if (/[A-Z]/.test(ch)) det.tecla("Shift", t - 1); det.tecla(ch, t); t += 9; }
  igual(det.tecla("Enter", t), { tipo: "escaneo", codigo: "AB12" }, "las teclas Shift en el medio no cortan el escaneo");
  // Una persona escribió algo, paró, y después llegó un escaneo: se escanea solo lo último.
  det = l.crearDetectorDeEscaneo();
  teclear(det, "55", 1000, 120, "x".length ? "ArrowLeft" : "");
  igual(teclear(det, "7790001234567", 3000, 10).fin, { tipo: "escaneo", codigo: "7790001234567" }, "después de escribir algo a mano, un escaneo nuevo se reconoce solo");
  // Dos escaneos seguidos.
  det = l.crearDetectorDeEscaneo();
  const a1 = teclear(det, "5901234123457", 1000, 10).fin;
  const a2 = teclear(det, "96385074", 1400, 10).fin;
  ok(a1.codigo === "5901234123457" && a2.codigo === "96385074", "dos escaneos seguidos se separan bien");
  ok(det.tecla("ArrowDown", 99).tipo === "ignorada" && det.tecla("Shift", 99).tipo === "ignorada", "las teclas que no son caracteres se ignoran");
  det = l.crearDetectorDeEscaneo();
  const primeras = [det.tecla("7", 1000), det.tecla("7", 1010), det.tecla("9", 1500)];
  ok(primeras[0].primero === true && primeras[1].primero === false && primeras[2].primero === true, "marca cuándo empieza una ráfaga nueva (para guardar cómo estaba el campo)");

  window.log("== Probar lector: el veredicto");
  const rafaga = (texto, paso, fin = "Enter") => {
    const teclas = [];
    let t2 = 100;
    for (const ch of texto) { teclas.push({ clave: ch, t: t2 }); t2 += paso; }
    if (fin) teclas.push({ clave: fin, t: t2 });
    return teclas;
  };
  const bien = l.analizarRafaga(rafaga("5901234123457", 9));
  ok(bien.veredicto === "lector" && bien.largo === 13 && bien.terminador === "Enter" && bien.promedioMs === 9, "un lector que anda bien: " + bien.mensaje);
  const lento = l.analizarRafaga(rafaga("5901234123457", 200));
  ok(lento.veredicto === "persona" && /a mano/.test(lento.mensaje), "escrito a mano: lo dice");
  const sinEnter = l.analizarRafaga(rafaga("5901234123457", 9, null));
  ok(sinEnter.veredicto === "sin_terminador" && /Enter/.test(sinEnter.mensaje), "un lector sin Enter al final: avisa que hay que configurarlo");
  ok(l.analizarRafaga(rafaga("12", 9)).veredicto === "corto", "muy corto");
  igual(l.analizarRafaga(rafaga("5901234123457", 9, "Tab")).terminador, "Tab", "reconoce el Tab como final");

  window.log("\naciertos: " + window.__aciertos + " · fallas: " + window.__fallas);
  window.__listo = true;
})().catch((err) => { document.getElementById("salida").textContent += "\nERROR: " + (err && err.stack || err); window.__listo = true; window.__fallas = (window.__fallas || 0) + 1; });
