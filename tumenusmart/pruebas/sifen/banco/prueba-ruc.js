// Prueba de la verificación de un RUC contra la DNIT (src/lib/sifen/ruc.ts, la parte de siConsRUC de ws.ts y consulta-ruc.ts): el mensaje se valida contra el
// esquema oficial con libxml2, se prueba la lectura de cada respuesta posible, la traducción a lo que ve el cajero (qué avisa y qué frena) y la consulta de
// punta a punta contra una DNIT simulada y una base en memoria.
(async () => {
  const { ok, igual } = window;
  const C = window.Cargador;
  const S = C.simulacros;
  S["node-forge"] = window.forge;
  const forge = window.forge;
  const BF = window.BaseFalsa;

  // ---------------------------------------------------------------- jueces: libxml2 con el esquema oficial de la consulta de RUC
  const { validateXML } = await import("/xmllint/index-browser.mjs");
  const leer = async (n) => (await fetch("/xsd-test/" + n)).text();
  const reescribir = (t) => t.replace(/schemaLocation\s*=\s*"https:\/\/ekuatia\.set\.gov\.py\/sifen\/xsd\/([^"]+)"/g, 'schemaLocation="$1"');
  const todos = ["FE_Types_v141.xsd", "SIFEN_Types_v141.xsd"];
  const preload = []; for (const n of todos) preload.push({ fileName: n, contents: reescribir(await leer(n)) });
  const principal = reescribir(await leer("WS_SiConsRUC_v141.xsd"));
  const validar = async (xml) => validateXML({ xml: [{ fileName: "m.xml", contents: xml }], schema: [{ fileName: "WS_SiConsRUC_v141.xsd", contents: principal }], preload });
  const interior = (sobre) => /<env:Body>([\s\S]*)<\/env:Body>/.exec(sobre)[1];
  const errores = (r) => (r.valid ? "" : " -> " + r.errors.map((e) => e.message).join(" | ").slice(0, 250));

  const NS = "http://ekuatia.set.gov.py/sifen/xsd";
  const soap = (c) => `<?xml version="1.0" encoding="UTF-8"?><env:Envelope xmlns:env="http://www.w3.org/2003/05/soap-envelope"><env:Header/><env:Body>${c}</env:Body></env:Envelope>`;
  const contenedor = ({ ruc = "80069563", razon = "EMPRESA DE PRUEBA S.A.", estado = "ACT", desc, fact = "S", p = "" }) =>
    `<${p}xContRUC><${p}dRUCCons>${ruc}</${p}dRUCCons><${p}dRazCons>${razon}</${p}dRazCons><${p}dCodEstCons>${estado}</${p}dCodEstCons><${p}dDesEstCons>${desc ?? ({ ACT: "Activo", SUS: "Suspensión Temporal", SAD: "Suspensión administrativa", BLQ: "Bloqueado", CAN: "Cancelado", CDE: "Cancelado definitivo" }[estado] || "Otro")}</${p}dDesEstCons><${p}dRUCFactElec>${fact}</${p}dRUCFactElec></${p}xContRUC>`;
  const respuesta = ({ codigo = "0502", mensaje = "RUC encontrado", datos, prefijo = false } = {}) => {
    const p = prefijo ? "ns2:" : "";
    const dentro = `<${p}dCodRes>${codigo}</${p}dCodRes><${p}dMsgRes>${mensaje}</${p}dMsgRes>${datos === null ? "" : contenedor({ ...(datos || {}), p })}`;
    return soap(prefijo ? `<ns2:rResEnviConsRUC xmlns:ns2="${NS}">${dentro}</ns2:rResEnviConsRUC>` : `<rResEnviConsRUC xmlns="${NS}">${dentro}</rResEnviConsRUC>`);
  };

  // ---------------------------------------------------------------- los mensajes
  const ws = await C.cargar("src/lib/sifen/ws");
  const rucLib = await C.cargar("src/lib/sifen/ruc");
  window.log("== Consulta de RUC: mensajes (validados contra el esquema oficial)");
  const pedido = ws.sobreSoap(ws.cuerpoConsultaRuc(1760000000020, "80069563"));
  ok(pedido.includes('<rEnviConsRUC xmlns="http://ekuatia.set.gov.py/sifen/xsd"><dId>1760000000020</dId><dRUCCons>80069563</dRUCCons></rEnviConsRUC>'), "SOAP 1.2: <rEnviConsRUC> con el número de control y el RUC SIN dígito verificador");
  let v = await validar(interior(pedido));
  ok(v.valid, "libxml2: <rEnviConsRUC> cumple WS_SiConsRUC_v141.xsd" + errores(v));
  for (const malo of ["123", "1234", "123456789", "0123456", "8006956-"]) {
    const vm = await validar(interior(ws.sobreSoap(ws.cuerpoConsultaRuc(1, malo))));
    ok(!vm.valid, `el esquema rechaza el RUC «${malo}» (por eso solo se consultan de 5 a 8 caracteres)`);
  }
  v = await validar(interior(respuesta()));
  ok(v.valid, "libxml2: la respuesta de ejemplo (0502 con contenedor) cumple <rResEnviConsRUC> del esquema oficial" + errores(v));
  v = await validar(interior(respuesta({ codigo: "0500", mensaje: "RUC no existe", datos: null })));
  ok(v.valid, "libxml2: la respuesta 0500 (sin contenedor) también" + errores(v));
  for (const e of ["ACT", "SUS", "SAD", "BLQ", "CAN", "CDE"]) {
    v = await validar(interior(respuesta({ datos: { estado: e } })));
    ok(v.valid, `libxml2: el estado ${e} cumple el esquema (descripción de hasta 25 caracteres)` + errores(v));
  }
  igual(ws.urlsDelServicio("consultaRuc", "pruebas"), ["https://sifen-test.set.gov.py/de/ws/consultas/consulta-ruc.wsdl", "https://sifen-test.set.gov.py/de/ws/consultas/consulta-ruc"], "direcciones de la consulta de RUC en pruebas (las del manual, con y sin «.wsdl»)");
  igual(ws.urlsDelServicio("consultaRuc", "produccion")[0], "https://sifen.set.gov.py/de/ws/consultas/consulta-ruc.wsdl", "y en producción");

  // ---------------------------------------------------------------- lo que escribe el cajero
  window.log("== Consulta de RUC: lo que escribe el cajero");
  const prep = rucLib.prepararConsultaRuc;
  let p = prep("80069563-1");
  igual([p.ok, p.numero, p.dvInformado, p.dvCorrecto], [true, "80069563", 1, 1], "80069563-1: número sin dígito, dígito escrito y dígito que corresponde");
  p = prep("  80 069 563-1  ");
  igual([p.ok, p.numero], [true, "80069563"], "los espacios se ignoran");
  p = prep("80069563");
  igual([p.ok, p.dvInformado, p.dvCorrecto], [true, null, 1], "sin dígito verificador: se consulta igual y se sabe cuál corresponde");
  p = prep("4987017-3");
  igual([p.ok, p.numero, p.dvCorrecto], [true, "4987017", 3], "una cédula con su dígito (7 dígitos)");
  const cod = await C.cargar("src/lib/sifen-codigos");
  p = prep(`123456A-${cod.calcularDvRuc("123456A")}`);
  ok(p.ok && p.numero === "123456A", "un número que termina en letra A-D es válido para el esquema");
  p = prep("80069563-2");
  ok(!p.ok && p.verificacion.resultado === "digito_incorrecto" && p.verificacion.bloquea && p.verificacion.nivel === "error" && p.verificacion.rucCompleto === "80069563-1" && p.verificacion.mensaje.includes("lleva 1, no 2"), "dígito mal (80069563-2): se frena SIN ir a la DNIT y se dice cuál era (módulo 11, validación 1309)");
  for (const [t, motivo] of [["", "vacío"], ["123", "3 dígitos"], ["1234", "4 dígitos"], ["123456789", "9 dígitos"], ["abc", "letras"], ["80069563-12", "dígito de 2 cifras"], ["80069563-1-2", "dos guiones"], ["0123456", "empieza en cero"], ["80069563-A", "dígito con letra"]]) {
    const q = prep(t);
    ok(!q.ok && q.verificacion.resultado === "no_consultable" && !q.verificacion.bloquea && q.verificacion.mensaje, `«${t}» (${motivo}): no se consulta, no frena nada y se explica cómo escribirlo`);
  }
  igual(["80012345-6", "5123456-0", " 80012345-6 "].map(rucLib.pareceRucConDigito), [true, true, true], "pareceRucConDigito: RUC completo con guion");
  igual(["80012345", "8001-6", "80012345-66", "abc-1", "012345-6", "800123456"].map(rucLib.pareceRucConDigito), [false, false, false, false, false, false], "pareceRucConDigito: lo incompleto no dispara la verificación automática");

  // ---------------------------------------------------------------- lo que contesta la DNIT
  window.log("== Consulta de RUC: respuestas de la DNIT");
  let r = ws.leerRespuestaConsultaRuc(respuesta());
  igual([r.tipo, r.codigo, r.contenido.ruc, r.contenido.razonSocial, r.contenido.estadoCodigo, r.contenido.estadoTexto, r.contenido.facturadorElectronico], ["consulta", "0502", "80069563", "EMPRESA DE PRUEBA S.A.", "ACT", "Activo", true], "0502: RUC, razón social, estado y si es facturador electrónico");
  r = ws.leerRespuestaConsultaRuc(respuesta({ datos: { fact: "N", estado: "act" }, prefijo: true }));
  igual([r.contenido.facturadorElectronico, r.contenido.estadoCodigo], [false, "ACT"], "con prefijo de espacio de nombres (ns2:), «N» = no es facturador electrónico y el estado en minúscula se normaliza");
  r = ws.leerRespuestaConsultaRuc(respuesta({ datos: { fact: "?" } }));
  ok(r.contenido.facturadorElectronico === null, "un valor raro en «facturador electrónico» queda como desconocido (no se inventa)");
  r = ws.leerRespuestaConsultaRuc(respuesta({ codigo: "0500", mensaje: "RUC no existe", datos: null }));
  igual([r.tipo, r.codigo, r.contenido], ["consulta", "0500", null], "0500: sin contenedor");
  r = ws.leerRespuestaConsultaRuc(respuesta({ codigo: "0501", mensaje: "RUC sin permiso consulta WS", datos: null }));
  igual([r.tipo, r.codigo], ["consulta", "0501"], "0501: sin permiso para el servicio");
  r = ws.leerRespuestaConsultaRuc(soap('<env:Fault><env:Code><env:Value>env:Sender</env:Value></env:Code><env:Reason><env:Text xml:lang="en">Certificado no autorizado</env:Text></env:Reason></env:Fault>'));
  igual([r.tipo, r.motivo], ["falla", "Certificado no autorizado"], "un error SOAP se reconoce");
  ok(ws.leerRespuestaConsultaRuc("<html><body>503 Servicio no disponible</body></html>").tipo === "ilegible", "una página de error del servidor no es una respuesta");
  ok(ws.leerRespuestaConsultaRuc("").tipo === "ilegible" && ws.leerRespuestaConsultaRuc("<a><b></a>").tipo === "ilegible", "vacía o mal formada: ilegible");
  ok(ws.leerRespuestaConsultaRuc(soap(`<rRetEnviDe xmlns="${NS}"/>`)).tipo === "ilegible", "la respuesta de otro servicio no se confunde con esta");
  ok(ws.leerRespuestaConsultaRuc('<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "bomba">]><r>&a;</r>').tipo === "ilegible", "un XML con DOCTYPE (entidades propias) se rechaza");

  // ---------------------------------------------------------------- qué ve el cajero y qué se frena
  window.log("== Consulta de RUC: qué se avisa y qué se frena");
  const leida = (codigo, datos) => ws.leerRespuestaConsultaRuc(respuesta({ codigo, datos: codigo === "0502" ? datos : null }));
  const interp = (resp, num = "80069563") => rucLib.interpretarRespuestaRuc(resp, { numero: num, dvCorrecto: cod.calcularDvRuc(num) });
  let t = interp(leida("0502", {}));
  ok(t.resultado === "encontrado" && t.nivel === "ok" && !t.bloquea && t.razonSocial === "EMPRESA DE PRUEBA S.A." && t.rucCompleto === "80069563-1" && t.facturadorElectronico === true && /Verificado/.test(t.mensaje), "RUC activo: verde, trae la razón social y el RUC completo, no frena");
  for (const e of ["SUS", "CAN", "CDE"]) {
    t = interp(leida("0502", { estado: e }));
    ok(t.resultado === "encontrado" && t.nivel === "error" && t.bloquea && t.estadoCodigo === e, `estado ${e}: la DNIT rechaza la factura (validaciones 1307/1308) → rojo y frena`);
  }
  for (const e of ["SAD", "BLQ"]) {
    t = interp(leida("0502", { estado: e }));
    ok(t.nivel === "aviso" && !t.bloquea && t.mensaje.includes("Revisalo"), `estado ${e}: no está entre los que rechaza la DNIT → solo se avisa, no frena`);
  }
  t = interp(leida("0502", { estado: "XYZ", desc: "Raro" }));
  ok(t.nivel === "aviso" && !t.bloquea && t.mensaje.includes("Raro"), "un estado desconocido no frena: se avisa con el texto que mandó la DNIT");
  t = interp(leida("0502", { razon: "  EMPRESA   CON    ESPACIOS  " }));
  ok(t.razonSocial === "EMPRESA CON ESPACIOS", "la razón social se limpia de espacios de más");
  t = interp(leida("0500"));
  ok(t.resultado === "no_existe" && t.nivel === "error" && t.bloquea && t.razonSocial === null && /no existe/i.test(t.mensaje), "0500: el RUC no existe → la DNIT lo rechazaría (validación 1306) → rojo y frena");
  t = interp(leida("0501"));
  ok(t.resultado === "no_disponible" && !t.bloquea && t.nivel === "info" && /permiso/.test(t.mensaje), "0501: tu RUC no tiene permiso de consulta → no frena la venta, se avisa");
  t = interp(leida("0599"));
  ok(t.resultado === "no_disponible" && !t.bloquea && t.mensaje.includes("0599"), "un código que no conocemos no frena");
  t = interp({ tipo: "consulta", codigo: "0502", mensaje: "x", contenido: null });
  ok(t.resultado === "no_disponible" && !t.bloquea, "0502 sin contenedor: no se inventa nada");
  t = interp(leida("0502", { ruc: "11111111" }));
  ok(t.resultado === "no_disponible" && !t.bloquea && /otro RUC/.test(t.mensaje), "si la DNIT contesta por OTRO RUC se descarta la respuesta");
  for (const mala of [{ tipo: "falla", motivo: "Internal error" }, { tipo: "ilegible", motivo: "no es XML" }]) {
    t = interp(mala);
    ok(t.resultado === "no_disponible" && !t.bloquea && t.nivel === "info" && t.mensaje.includes("dígito verificador"), `${mala.tipo}: nunca frena; avisa que solo se controló el dígito`);
  }

  // ---------------------------------------------------------------- de punta a punta: certificado, ambiente, caché y fallos
  window.log("== Consulta de RUC: de punta a punta (DNIT simulada)");
  const claveMaestra = forge.util.encode64(forge.random.getBytesSync(32));
  window.process = { env: { CERTIFICADOS_CLAVE: claveMaestra } };
  const certLib = await C.cargar("src/lib/sifen/certificado");
  const muestras = window.MUESTRAS_P12;
  const leido = certLib.leerCertificadoP12(muestras.moderno, muestras.clave).certificado;
  BF.reiniciar();
  const alcance = await C.cargar("src/lib/alcance-local");
  BF.instalar(S, (id) => new Proxy({}, { get: (_, nombre) => new Proxy({}, { get: (__, op) => (args) => BF.db[nombre][op](alcance.aplicarLocal(nombre[0].toUpperCase() + nombre.slice(1), op, args, id)) }) }));
  S["node:https"] = { request: () => { throw new Error("En las pruebas no hay red: el transporte se reemplaza por una DNIT simulada"); } };
  const consulta = await C.cargar("src/lib/sifen/consulta-ruc");
  const storeId = "local-1";
  const ahora0 = new Date("2026-10-09T18:00:00Z");
  const sembrar = async (id, extra = {}) => {
    BF.tablas.certificadoFirma = [...(BF.tablas.certificadoFirma || []).filter((f) => f.storeId !== id), { id: "c-" + id, storeId: id, activo: true, validoHasta: new Date(Date.now() + 200 * 864e5), certificadoBase64: leido.certificadoBase64, cadenaPem: [], clavePrivadaCifrada: await certLib.cifrarSecreto(leido.clavePrivadaPem, claveMaestra, id), createdAt: new Date(), ...extra }];
  };
  await sembrar(storeId);
  BF.tablas.configFacturacionElectronica = [{ id: "cfg1", storeId, ambiente: "pruebas" }];

  const llamadas = [];
  let siguiente = [];
  const transporte = async (pet) => {
    llamadas.push(pet);
    const c = siguiente.shift();
    if (!c) throw new Error("La DNIT simulada no tenía preparada una respuesta");
    return c(pet);
  };
  const responde = (cuerpo, status = 200) => async () => ({ status, cuerpo, url: "simulada" });
  const sinRed = (m = "connect ETIMEDOUT 200.1.2.3:443") => async () => { throw new Error(m); };
  const nueva = () => { llamadas.length = 0; siguiente = []; consulta.olvidarConsultasDeRuc(); };
  const verificar = (entrada, extra = {}, id = storeId) => consulta.verificarRucEnLaDnit(id, entrada, { transporte, ahora: ahora0, ...extra });

  // 1. encontrado y activo
  nueva();
  siguiente.push(responde(respuesta()));
  t = await verificar("80069563-1");
  ok(t.resultado === "encontrado" && t.nivel === "ok" && !t.bloquea && t.razonSocial === "EMPRESA DE PRUEBA S.A.", "RUC activo: verificado");
  const l0 = llamadas[0];
  ok(llamadas.length === 1 && l0.servicio === "consultaRuc" && l0.ambiente === "pruebas", "una sola llamada, al servicio de consulta de RUC y en el ambiente configurado");
  ok(l0.certificadoPem.startsWith("-----BEGIN CERTIFICATE-----") && l0.clavePem.startsWith("-----BEGIN PRIVATE KEY-----"), "la conexión se presenta con el certificado del local (descifrado de la bóveda)");
  ok(l0.tiempoLimiteMs === 8000, "espera 8 segundos como mucho (un cajero está esperando)");
  ok(l0.cuerpo.includes("<dRUCCons>80069563</dRUCCons>") && !l0.cuerpo.includes("80069563-1"), "lo enviado lleva el RUC sin dígito verificador");
  ok((await validar(interior(l0.cuerpo))).valid, "y cumple el esquema oficial");

  // 2. caché: la misma consulta no vuelve a la DNIT; "forzar" sí
  t = await verificar("80069563-1");
  ok(t.resultado === "encontrado" && llamadas.length === 1, "la misma consulta de hace un momento se contesta sin volver a la DNIT (buscar y después crear el cliente no consulta dos veces)");
  siguiente.push(responde(respuesta({ datos: { estado: "SUS" } })));
  t = await verificar("80069563-1", { forzar: true });
  ok(llamadas.length === 2 && t.bloquea && t.estadoCodigo === "SUS", "el botón «Verificar» (forzar) consulta de nuevo y ve el cambio de estado");
  t = await verificar("80069563-1");
  ok(llamadas.length === 2 && t.estadoCodigo === "SUS", "y esa respuesta nueva es la que queda guardada");
  siguiente.push(responde(respuesta()));
  t = await verificar("80069563-1", { ahora: new Date(ahora0.getTime() + 6 * 60_000) });
  ok(llamadas.length === 3 && !t.bloquea, "pasados 5 minutos se consulta de nuevo");

  // 3. no existe: también se guarda un rato
  nueva();
  siguiente.push(responde(respuesta({ codigo: "0500", mensaje: "RUC no existe", datos: null })));
  t = await verificar("80012345-0");
  ok(t.resultado === "no_existe" && t.bloquea && llamadas.length === 1, "RUC inexistente: frena");
  t = await verificar("80012345-0");
  ok(t.resultado === "no_existe" && llamadas.length === 1, "y no se vuelve a preguntar enseguida");

  // 4. dígito mal: ni se consulta
  nueva();
  t = await verificar("80069563-9");
  ok(t.resultado === "digito_incorrecto" && t.bloquea && llamadas.length === 0, "dígito verificador mal: no se llama a la DNIT");

  // 5. sin dígito: se consulta y se devuelve el RUC completo
  nueva();
  siguiente.push(responde(respuesta()));
  t = await verificar("80069563");
  ok(t.resultado === "encontrado" && t.rucCompleto === "80069563-1" && llamadas.length === 1, "sin dígito verificador: se consulta y vuelve el RUC completo (80069563-1)");

  // 6. fallos de comunicación: nunca frenan y no se guardan
  nueva();
  siguiente.push(sinRed());
  t = await verificar("80069563-1");
  ok(t.resultado === "no_disponible" && !t.bloquea && t.nivel === "info" && t.rucCompleto === "80069563-1" && t.mensaje.includes("ETIMEDOUT") && t.mensaje.includes("dígito verificador"), "sin conexión: no frena, avisa y deja el RUC completo");
  siguiente.push(responde("<html><body>Service Unavailable</body></html>", 503));
  t = await verificar("80069563-1");
  ok(t.resultado === "no_disponible" && !t.bloquea && llamadas.length === 2, "una página de error del servidor: no frena, y lo anterior no quedó guardado (se volvió a intentar)");
  siguiente.push(responde(soap("<env:Fault><env:Reason><env:Text>Certificado no autorizado</env:Text></env:Reason></env:Fault>"), 500));
  t = await verificar("80069563-1");
  ok(t.resultado === "no_disponible" && !t.bloquea && t.mensaje.includes("Certificado no autorizado"), "error SOAP: no frena y se ve el motivo");
  siguiente.push(async () => { throw "texto suelto"; });
  t = await verificar("80069563-1");
  ok(t.resultado === "no_disponible" && !t.bloquea, "aunque el transporte lance algo que no es un Error, no se rompe");

  // 7. local sin certificado: en silencio
  nueva();
  t = await verificar("80069563-1", {}, "local-sin-certificado");
  ok(t.resultado === "no_disponible" && t.mensaje === null && !t.bloquea && t.rucCompleto === "80069563-1" && llamadas.length === 0, "un local sin certificado (no factura electrónico): no consulta y no muestra nada");

  // 8. certificado vencido y clave maestra ausente
  nueva();
  await sembrar("local-vencido", { validoHasta: new Date(Date.now() - 864e5) });
  t = await verificar("80069563-1", {}, "local-vencido");
  ok(t.resultado === "no_disponible" && !t.bloquea && /vencido/.test(t.mensaje) && llamadas.length === 0, "certificado vencido: no consulta, avisa y no frena");
  const guardada = window.process.env.CERTIFICADOS_CLAVE;
  delete window.process.env.CERTIFICADOS_CLAVE;
  t = await verificar("80012345-0");
  ok(t.resultado === "no_disponible" && !t.bloquea && /CERTIFICADOS_CLAVE/.test(t.mensaje) && llamadas.length === 0, "sin la clave del servidor: no consulta, avisa y no frena");
  window.process.env.CERTIFICADOS_CLAVE = guardada;

  // 9. cada local con lo suyo: certificado, ambiente y lo guardado
  nueva();
  await sembrar("local-2");
  BF.tablas.configFacturacionElectronica.push({ id: "cfg2", storeId: "local-2", ambiente: "produccion" });
  siguiente.push(responde(respuesta()));
  await verificar("80069563-1");
  siguiente.push(responde(respuesta({ datos: { razon: "OTRO NOMBRE" } })));
  t = await verificar("80069563-1", {}, "local-2");
  ok(llamadas.length === 2 && llamadas[1].ambiente === "produccion" && t.razonSocial === "OTRO NOMBRE", "lo guardado de un local NO se le sirve a otro: el otro local consulta con su certificado y su ambiente (producción)");
  const distintos = new Set(llamadas.map((l) => l.ambiente));
  ok(distintos.size === 2, "pruebas y producción se consultan por separado");

  // 10. tope por local: el certificado del local no se puede usar para llenar a la DNIT de consultas
  nueva();
  const numeroN = (i) => String(5000000 + i);
  const conDv = (i) => `${numeroN(i)}-${cod.calcularDvRuc(numeroN(i))}`;
  for (let i = 0; i < 30; i++) siguiente.push(responde(respuesta({ datos: { ruc: numeroN(i) } })));
  for (let i = 0; i < 30; i++) await verificar(conDv(i));
  ok(llamadas.length === 30, "30 consultas distintas en un minuto: todas llegan a la DNIT");
  t = await verificar(conDv(30));
  ok(t.resultado === "no_disponible" && !t.bloquea && /demasiadas consultas/.test(t.mensaje) && t.rucCompleto === conDv(30) && llamadas.length === 30, "la 31ª en el mismo minuto no sale: avisa, no frena la venta y deja el RUC completo");
  t = await verificar(conDv(30), { forzar: true });
  ok(t.resultado === "no_disponible" && llamadas.length === 30, "ni forzándola con el botón «Verificar»");
  t = await verificar(conDv(3));
  ok(t.resultado === "encontrado" && llamadas.length === 30, "lo que ya estaba guardado se sigue contestando (no cuenta para el tope)");
  await sembrar("local-3");
  siguiente.push(responde(respuesta({ datos: { ruc: numeroN(30) } })));
  t = await verificar(conDv(30), {}, "local-3");
  ok(t.resultado === "encontrado" && llamadas.length === 31, "el tope es de cada local: otro local consulta con normalidad");
  siguiente.push(responde(respuesta({ datos: { ruc: numeroN(30) } })));
  t = await verificar(conDv(30), { ahora: new Date(ahora0.getTime() + 61_000) });
  ok(t.resultado === "encontrado" && llamadas.length === 32, "pasado el minuto vuelve a consultar");

  window.log("\naciertos: " + window.__aciertos + " · fallas: " + window.__fallas);
  window.__listo = true;
})().catch((e) => { document.getElementById("salida").textContent += "\nERROR: " + (e && e.stack || e); window.__listo = true; window.__fallas = (window.__fallas || 0) + 1; });
