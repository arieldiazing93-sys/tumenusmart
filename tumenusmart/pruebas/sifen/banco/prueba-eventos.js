// Prueba de los eventos del emisor: la CANCELACIÓN de un documento aprobado y la INUTILIZACIÓN de números (src/lib/sifen/eventos.ts, solicitudes.ts y la parte
// de eventos de envio.ts). El XML firmado se valida contra el esquema oficial de eventos con libxml2 y su firma con tres jueces; los estados y reintentos, contra
// una DNIT simulada y una base en memoria.
(async () => {
  const { ok, igual } = window;
  const C = window.Cargador;
  const S = C.simulacros;
  S["node-forge"] = window.forge;
  const forge = window.forge;
  const BF = window.BaseFalsa;

  // ---------------------------------------------------------------- jueces
  const { validateXML } = await import("/xmllint/index-browser.mjs");
  const leer = async (n) => (await fetch("/xsd-test/" + n)).text();
  const reescribir = (t) => t.replace(/schemaLocation\s*=\s*"https:\/\/ekuatia\.set\.gov\.py\/sifen\/xsd\/([^"]+)"/g, 'schemaLocation="$1"');
  const todos = ["DE_v150.xsd", "DE_Types_v150.xsd", "Paises_v100.xsd", "Departamentos_v141.xsd", "Monedas_v150.xsd", "Unidades_Medida_v141.xsd", "xmldsig-core-schema.xsd", "protProcesDE_v150.xsd", "SIFEN_Types_v141.xsd", "protProcesEventos_v141.xsd", "Evento_v150.xsd", "Evento_Types_v150.xsd"];
  const preload = []; for (const n of todos) preload.push({ fileName: n, contents: reescribir(await leer(n)) });
  const principal = reescribir(await leer("WS_SiRecepEvento_v150.xsd"));
  const validar = async (xml) => validateXML({ xml: [{ fileName: "m.xml", contents: xml }], schema: [{ fileName: "WS_SiRecepEvento_v150.xsd", contents: principal }], preload });
  const interior = (sobre) => /<env:Body>([\s\S]*)<\/env:Body>/.exec(sobre)[1];
  const X = await import("https://esm.sh/xmldsigjs@2.5.0");
  const verificarConOtro = async (texto) => {
    const doc = X.Parse(texto);
    const firmas = doc.getElementsByTagNameNS("http://www.w3.org/2000/09/xmldsig#", "Signature");
    if (firmas.length !== 1) return "sin firma";
    const sx = new X.SignedXml(doc); sx.LoadXml(firmas[0]);
    try { return await sx.Verify(); } catch (e) { return "error: " + (e && e.message || e); }
  };

  // ---------------------------------------------------------------- certificado y un documento aprobado de base
  const claveMaestra = forge.util.encode64(forge.random.getBytesSync(32));
  window.process = { env: { CERTIFICADOS_CLAVE: claveMaestra } };
  const certLib = await C.cargar("src/lib/sifen/certificado");
  const firma = await C.cargar("src/lib/sifen/firma");
  const armar = await C.cargar("src/lib/sifen/armar-de");
  const cod = await C.cargar("src/lib/sifen-codigos");
  const muestras = window.MUESTRAS_P12;
  const leido = certLib.leerCertificadoP12(muestras.moderno, muestras.clave).certificado;
  const material = { clavePrivadaPkcs8: firma.pemADer(leido.clavePrivadaPem), certificadoBase64: leido.certificadoBase64 };
  const storeId = "local-1";
  const dv = (n) => cod.calcularDvRuc(String(n));
  const emisorDatos = { tipoContribuyente: "persona_juridica", tipoRegimen: null, nombreFantasia: "Lo de Fabri", denominacionSucursal: "Casa central", telefono: "0981123456", email: "fabri@correo.com.py", direccion: "Av. Mariscal López", numeroCasa: "1234", complemento: null, departamento: "capital", distritoCodigo: 1, distrito: null, ciudadCodigo: 1, ciudad: null, actividades: [{ codigo: "56101", descripcion: "Restaurantes y parrillas" }] };
  const items = [{ codigo: "p1", descripcion: "Pizza", unidadMedida: "unidad", cantidad: 1, precioUnitario: 55000, descuento: 0, total: 55000, iva: "gravado10" }];
  const comp = { tipo: "factura", modalidad: "electronico", tipoEmision: "normal", timbrado: "80012345", timbradoDesde: new Date("2026-01-01T03:00:00Z"), establecimiento: "001", punto: "001", correlativo: 47, numero: "001-001-0000047", fechaEmision: new Date("2026-10-09T17:30:05Z"), tipoTransaccion: "venta_mercaderia", moneda: "PYG", emisorRuc: "80012345-" + dv("80012345"), emisorRazonSocial: "Fabri S.A.", emisorDatos, receptorTipoIdentificacion: "ruc", receptorNumeroIdentificacion: "80069563-" + dv("80069563"), receptorRazonSocial: "Cliente de Prueba S.A.", receptorEmail: null, presencia: "presencial", condicion: "contado", fechaVencimientoCredito: null, items, total: 55000 };
  const CDC = armar.armarDE(comp, [{ forma: "efectivo", monto: 55000 }], { ambiente: "pruebas", fechaFirma: new Date("2026-10-09T17:31:00Z"), codigoSeguridad: "587326098" }).cdc;

  // ---------------------------------------------------------------- 1. el evento firmado
  const ev = await C.cargar("src/lib/sifen/eventos");
  const ws = await C.cargar("src/lib/sifen/ws");
  window.log("== Evento de cancelación: estructura, esquema oficial y firma");
  const AHORA = new Date("2026-10-09T18:00:00Z");
  const can = await ev.firmarCancelacion({ cdc: CDC, motivo: "La mercadería no fue entregada al cliente", idEvento: "1760032800", fechaFirma: AHORA }, material);
  ok(can.xml.startsWith('<gGroupGesEve xmlns="http://ekuatia.set.gov.py/sifen/xsd"><rGesEve><rEve Id="1760032800"><dFecFirma>2026-10-09T15:00:00</dFecFirma><dVerFor>150</dVerFor><gGroupTiEvt><rGeVeCan><Id>' + CDC + "</Id><mOtEve>La mercadería no fue entregada al cliente</mOtEve></rGeVeCan></gGroupTiEvt></rEve><Signature "), "estructura: gGroupGesEve › rGesEve › rEve (Id, fecha de firma en hora de Asunción, versión 150, grupo de cancelación) y después la firma");
  ok(can.xml.includes('<Reference URI="#1760032800">') && (can.xml.match(/<Transform /g) || []).length === 1 && !/<\?xml/.test(can.xml), "la firma referencia el Id del evento (no el CDC), con una sola transformación, y no lleva declaración XML");
  const envoltorio = ws.sobreSoap(ws.cuerpoEvento(1760032800123, can.xml));
  const vx = await validar(interior(envoltorio));
  ok(vx.valid, "libxml2: <rEnviEventoDe> con la cancelación cumple WS_SiRecepEvento_v150.xsd" + (vx.valid ? "" : " -> " + vx.errors.map((e) => e.message).join(" | ").slice(0, 400)));
  const propia = await firma.verificarFirmaEvento(can.xml);
  ok(propia.valida && propia.cdc === "1760032800", "verificación propia: firma válida");
  const otro = await verificarConOtro(can.xml);
  ok(otro === true, "xmldsigjs (otra implementación): firma VÁLIDA" + (otro === true ? "" : " -> " + otro));
  const alterado = can.xml.replace("no fue entregada", "sí fue entregada");
  ok((await firma.verificarFirmaEvento(alterado)).valida === false && (await verificarConOtro(alterado)) !== true, "tocar el motivo después de firmar rompe la firma (los dos jueces)");
  const motivoRaro = await ev.firmarCancelacion({ cdc: CDC, motivo: 'Error "grave" en <el pedido> & más\r\n   texto  ', fechaFirma: AHORA }, material);
  ok(motivoRaro.xml.includes("<mOtEve>Error \"grave\" en &lt;el pedido&gt; &amp; más texto</mOtEve>") && (await firma.verificarFirmaEvento(motivoRaro.xml)).valida && (await verificarConOtro(motivoRaro.xml)) === true, "un motivo con comillas, < >, & y saltos de línea se escapa, se deja en una línea y la firma sigue válida");
  const sinId = await ev.firmarCancelacion({ cdc: CDC, motivo: "Motivo de prueba", fechaFirma: AHORA }, material);
  ok(/^\d{1,10}$/.test(sinId.idEvento) && sinId.idEvento !== "0", "sin pedirlo, el identificador del evento sale de 1 a 10 dígitos");
  const mal = async (f) => { try { await f(); return null; } catch (e) { return e.message; } };
  ok((await mal(() => ev.firmarCancelacion({ cdc: "123", motivo: "motivo valido" }, material))).includes("CDC"), "un CDC inválido se rechaza antes de firmar");
  ok((await mal(() => ev.firmarCancelacion({ cdc: CDC, motivo: "ab" }, material))).includes("al menos 5"), "un motivo de menos de 5 caracteres, también");
  ok((await mal(() => ev.firmarCancelacion({ cdc: CDC, motivo: "x".repeat(501) }, material))).includes("500"), "y uno de más de 500");

  window.log("== Evento de inutilización");
  const inu = await ev.firmarInutilizacion({ timbrado: "80012345", establecimiento: "001", punto: "001", desde: 47, hasta: 49, tipoDocumento: 1, motivo: "Documentos rechazados por error de llenado", idEvento: "1760032801", fechaFirma: AHORA }, material);
  ok(inu.xml.includes("<rGeVeInu><dNumTim>80012345</dNumTim><dEst>001</dEst><dPunExp>001</dPunExp><dNumIn>0000047</dNumIn><dNumFin>0000049</dNumFin><iTiDE>1</iTiDE><mOtEve>Documentos rechazados por error de llenado</mOtEve></rGeVeInu>"), "el rango sale con los números completados con ceros a la izquierda (7 dígitos) y el tipo de documento");
  const vi = await validar(interior(ws.sobreSoap(ws.cuerpoEvento(1760032800124, inu.xml))));
  ok(vi.valid, "libxml2: la inutilización cumple el esquema oficial" + (vi.valid ? "" : " -> " + vi.errors.map((e) => e.message).join(" | ").slice(0, 400)));
  ok((await firma.verificarFirmaEvento(inu.xml)).valida && (await verificarConOtro(inu.xml)) === true, "firma válida para los dos jueces");
  for (const [que, datos, texto] of [
    ["timbrado de 7 dígitos", { timbrado: "1234567", desde: 1, hasta: 1 }, "8 dígitos"],
    ["establecimiento mal", { establecimiento: "1", desde: 1, hasta: 1 }, "3 dígitos"],
    ["rango al revés", { desde: 10, hasta: 5 }, "mayor o igual"],
    ["más de 1000 números", { desde: 1, hasta: 1001 }, "1000"],
    ["tipo de documento 9", { desde: 1, hasta: 1, tipoDocumento: 9 }, "tipo de documento"],
    ["motivo de 151 caracteres", { desde: 1, hasta: 1, motivo: "x".repeat(151) }, "150"],
    ["número cero", { desde: 0, hasta: 1 }, "entre 1"],
  ]) {
    const m = await mal(() => ev.firmarInutilizacion({ timbrado: "80012345", establecimiento: "001", punto: "001", desde: 1, hasta: 1, tipoDocumento: 1, motivo: "motivo valido", ...datos }, material));
    ok(m && m.includes(texto), "inutilización con " + que + ": se rechaza (" + (m || "no falló") + ")");
  }
  ok((await ev.firmarInutilizacion({ timbrado: "80012345", establecimiento: "001", punto: "001", desde: 1, hasta: 1000, tipoDocumento: 1, motivo: "salto de numeración", fechaFirma: AHORA }, material)).xml.includes("<dNumFin>0001000</dNumFin>"), "el máximo de 1000 números sí se acepta");
  igual([ev.horasQueQuedanParaCancelar(new Date("2026-10-09T18:00:00Z"), new Date("2026-10-10T18:00:00Z")), ev.horasQueQuedanParaCancelar(new Date("2026-10-09T18:00:00Z"), new Date("2026-10-11T19:00:00Z"))], [24, -1], "el plazo para cancelar una factura: 48 horas desde que la DNIT la aprobó");

  // ---------------------------------------------------------------- 2. las respuestas del servicio de eventos
  window.log("== Respuesta del servicio de eventos");
  const NS = "http://ekuatia.set.gov.py/sifen/xsd";
  const soap = (c) => `<?xml version="1.0" encoding="UTF-8"?><env:Envelope xmlns:env="http://www.w3.org/2003/05/soap-envelope"><env:Header/><env:Body>${c}</env:Body></env:Envelope>`;
  const respEvento = (estado, codigo, mensaje, { prot = "8800001", id = "1760032800" } = {}) => soap(`<rRetEnviEventoDe xmlns="${NS}"><dFecProc>2026-10-09T15:00:20-03:00</dFecProc><gResProcEVe><dEstRes>${estado}</dEstRes>${prot ? `<dProtAut>${prot}</dProtAut>` : ""}<id>${id}</id><gResProc><dCodRes>${codigo}</dCodRes><dMsgRes>${mensaje}</dMsgRes></gResProc></gResProcEVe></rRetEnviEventoDe>`);
  const ejemplo = respEvento("Aprobado", "0600", "Evento registrado correctamente");
  const ve = await validar(interior(ejemplo));
  ok(ve.valid, "libxml2: la respuesta de ejemplo cumple <rRetEnviEventoDe> del esquema oficial" + (ve.valid ? "" : " -> " + ve.errors.map((e) => e.message).join(" | ").slice(0, 300)));
  let r = ws.leerRespuestaEvento(ejemplo);
  igual([r.tipo, r.resultados[0].estado, r.resultados[0].protocoloAutorizacion, r.resultados[0].id, r.resultados[0].codigo], ["evento", "aprobado", "8800001", "1760032800", "0600"], "se lee el estado, el protocolo, el id y el código");
  r = ws.leerRespuestaEvento(respEvento("Rechazado", "4009", "Plazo de solicitud de cancelación de una FE extemporáneo", { prot: null }));
  ok(r.resultados[0].estado === "rechazado" && r.resultados[0].protocoloAutorizacion === null && r.resultados[0].codigo === "4009", "rechazado: sin protocolo y con el código del motivo");
  ok(ws.leerRespuestaEvento("<html>503</html>").tipo === "ilegible" && ws.leerRespuestaEvento(soap("<env:Fault><env:Reason><env:Text>x</env:Text></env:Reason></env:Fault>")).tipo === "falla", "un HTML de error es ilegible y un Fault SOAP es una falla");

  // ---------------------------------------------------------------- 3. pedir eventos
  window.log("== Pedir un evento");
  BF.reiniciar();
  const alcance = await C.cargar("src/lib/alcance-local");
  BF.instalar(S, (id) => new Proxy({}, { get: (_, nombre) => new Proxy({}, { get: (__, op) => (args) => BF.db[nombre][op](alcance.aplicarLocal(nombre[0].toUpperCase() + nombre.slice(1), op, args, id)) }) }));
  S["node:https"] = { request: () => { throw new Error("En las pruebas no hay red"); } };
  const sol = await C.cargar("src/lib/sifen/solicitudes");
  const envio = await C.cargar("src/lib/sifen/envio");
  let n = 0;
  const cdcFalso = () => String(2000 + ++n).padStart(44, "0");
  const doc = (extra = {}) => { const fila = { id: "d" + ++n, storeId, cdc: CDC, ambiente: "pruebas", vistaPrevia: false, estado: "aprobado", xmlFirmado: "x", enviadoEn: new Date(AHORA.getTime() - 3600_000), procesadoEn: new Date(AHORA.getTime() - 3600_000), firmadoEn: new Date(AHORA.getTime() - 7200_000), intentos: 1, proximoIntentoEn: null, ...extra }; BF.tablas.documentoElectronico = [...(BF.tablas.documentoElectronico || []), fila]; return fila; };
  const eventos = () => BF.tablas.eventoElectronico || [];
  let r1 = await sol.solicitarCancelacion(BF.db, { storeId, documentoId: doc().id, motivo: "Venta cancelada por el cajero", creadoPor: "Ariel" });
  ok(r1.creada && eventos().length === 1 && eventos()[0].tipo === "cancelacion" && eventos()[0].estado === "pendiente" && eventos()[0].cdc === CDC && !eventos()[0].xmlFirmado, "una cancelación pedida queda pendiente, con el CDC del documento y SIN firmar (se firma después)");
  const dA = BF.tablas.documentoElectronico[0].id;
  r1 = await sol.solicitarCancelacion(BF.db, { storeId, documentoId: dA, motivo: "otra vez", creadoPor: "Ariel" });
  ok(!r1.creada && r1.motivo.includes("Ya hay") && eventos().length === 1, "pedirla dos veces no duplica");
  for (const [que, extra, texto] of [["una vista previa", { vistaPrevia: true }, "vista previa"], ["un documento rechazado", { estado: "rechazado" }, "rechazó"], ["uno ya cancelado", { estado: "cancelado" }, "ya está cancelado"]]) {
    const d = doc(extra); const antes = eventos().length;
    const rr = await sol.solicitarCancelacion(BF.db, { storeId, documentoId: d.id, motivo: "motivo", creadoPor: "x" });
    ok(!rr.creada && rr.motivo.includes(texto) && eventos().length === antes, "no se pide la cancelación de " + que);
  }
  const rCorto = await sol.solicitarCancelacion(BF.db, { storeId, documentoId: doc().id, motivo: "ab", creadoPor: "x" });
  ok(rCorto.creada && eventos()[eventos().length - 1].motivo.length >= 5 && eventos()[eventos().length - 1].motivo.includes("ab"), "un motivo muy corto se completa para cumplir el mínimo de la DNIT");
  const rSin = await sol.solicitarCancelacion(BF.db, { storeId, documentoId: doc().id, motivo: null, creadoPor: "x" });
  ok(rSin.creada && eventos()[eventos().length - 1].motivo.length >= 5, "y sin motivo, también");
  ok(!(await sol.solicitarCancelacion(BF.db, { storeId, documentoId: "no-existe", motivo: "m", creadoPor: "x" })).creada && !(await sol.solicitarCancelacion(BF.db, { storeId: "otro", documentoId: dA, motivo: "m", creadoPor: "x" })).creada, "un documento que no existe, o de otro local, tampoco");
  const ri = await sol.solicitarInutilizacion(BF.db, { storeId, timbrado: "80012345", establecimiento: "001", punto: "001", desde: 47, hasta: 47, tipoDocumento: 1, motivo: "Documento rechazado por la DNIT", creadoPor: "Ariel" });
  ok(ri.creada && !(await sol.solicitarInutilizacion(BF.db, { storeId, timbrado: "80012345", establecimiento: "001", punto: "001", desde: 47, hasta: 47, tipoDocumento: 1, motivo: "otra", creadoPor: "x" })).creada, "inutilización: se pide una vez y no se duplica");
  ok(!(await sol.solicitarInutilizacion(BF.db, { storeId, timbrado: "80012345", establecimiento: "001", punto: "001", desde: 1, hasta: 2000, tipoDocumento: 1, motivo: "m", creadoPor: "x" })).creada, "un rango de más de 1000 números no se pide");

  // ---------------------------------------------------------------- 4. enviar eventos
  window.log("== Enviar eventos y estados");
  BF.tablas.eventoElectronico = []; BF.tablas.documentoElectronico = [];
  BF.tablas.certificadoFirma = [{ id: "c1", storeId, activo: true, validoHasta: new Date(Date.now() + 200 * 864e5), certificadoBase64: leido.certificadoBase64, cadenaPem: [], clavePrivadaCifrada: await certLib.cifrarSecreto(leido.clavePrivadaPem, claveMaestra, storeId), createdAt: new Date() }];
  BF.tablas.configFacturacionElectronica = [{ storeId, ambiente: "pruebas", idCsc: "0001", cscCifrado: await certLib.cifrarSecreto("ABCD0000000000000000000000000000", claveMaestra, storeId) }];
  const llamadas = []; const cola = [];
  const transporte = async (p) => { llamadas.push(p); const f = cola.shift(); if (!f) throw new Error("sin respuesta preparada"); return f(p); };
  const responde = (cuerpo, status = 200) => async () => ({ status, cuerpo, url: "simulada" });
  const sinRed = (m = "connect ETIMEDOUT") => async () => { throw new Error(m); };
  const nuevoEvento = (d, extra = {}) => { const fila = { id: "e" + ++n, storeId, tipo: "cancelacion", documentoId: d.id, cdc: d.cdc, motivo: "Venta cancelada por el cajero", estado: "pendiente", idEvento: null, xmlFirmado: null, enviadoEn: null, procesadoEn: null, protocoloAutorizacion: null, intentos: 0, proximoIntentoEn: null, createdAt: new Date(AHORA.getTime() - 1000), creadoPor: "t", ...extra }; BF.tablas.eventoElectronico = [...(BF.tablas.eventoElectronico || []), fila]; return fila; };
  const filaE = (id) => BF.tablas.eventoElectronico.find((f) => f.id === id);
  const filaD = (id) => BF.tablas.documentoElectronico.find((f) => f.id === id);
  const limpiar = () => { llamadas.length = 0; cola.length = 0; };

  // a. cancelación de un documento aprobado
  let d1 = doc(); let e1 = nuevoEvento(d1);
  cola.push(responde(respEvento("Aprobado", "0600", "Evento registrado correctamente", { prot: "8800011" })));
  let res = await envio.enviarEvento(storeId, e1.id, { transporte, ahora: AHORA });
  igual([res.ok, res.estado], [true, "aprobado"], "cancelación: aprobada por la DNIT");
  ok(filaE(e1.id).estado === "aprobado" && filaE(e1.id).protocoloAutorizacion === "8800011" && filaD(d1.id).estado === "cancelado" && filaE(e1.id).errorEnvio === null, "el evento queda aprobado con su protocolo y el documento pasa a «cancelado»");
  ok(llamadas.length === 1 && llamadas[0].servicio === "evento" && llamadas[0].ambiente === "pruebas", "una sola llamada, al servicio de eventos");
  ok((await validar(interior(llamadas[0].cuerpo))).valid, "lo enviado cumple el esquema oficial de eventos");
  ok(filaE(e1.id).xmlFirmado && (await firma.verificarFirmaEvento(filaE(e1.id).xmlFirmado)).valida && filaE(e1.id).xmlFirmado.includes("<mOtEve>Venta cancelada por el cajero</mOtEve>") && /^\d{1,10}$/.test(filaE(e1.id).idEvento), "el XML firmado y su identificador quedan guardados, y la firma verifica");
  res = await envio.enviarEvento(storeId, e1.id, { transporte, ahora: AHORA });
  ok(!res.ok && res.motivo === "no_corresponde" && llamadas.length === 1, "un evento ya aprobado no se vuelve a enviar");

  // b. el documento todavía no está aprobado: la cancelación espera
  limpiar();
  let d2 = doc({ estado: "firmado", enviadoEn: null, procesadoEn: null }); let e2 = nuevoEvento(d2);
  res = await envio.enviarEvento(storeId, e2.id, { transporte, ahora: AHORA });
  ok(!res.ok && res.motivo === "esperando" && llamadas.length === 0 && filaE(e2.id).estado === "pendiente" && filaE(e2.id).xmlFirmado === null && filaE(e2.id).proximoIntentoEn.getTime() === AHORA.getTime() + 120_000 && filaE(e2.id).intentos === 0, "si el documento aún no fue aprobado, la cancelación ESPERA (no firma ni envía nada, no cuenta intento y vuelve a mirar en 2 minutos)");
  filaD(d2.id).estado = "aprobado"; filaD(d2.id).procesadoEn = AHORA;
  cola.push(responde(respEvento("Aprobado", "0600", "ok", { prot: "8800012" })));
  res = await envio.enviarEvento(storeId, e2.id, { transporte, ahora: new Date(AHORA.getTime() + 130_000) });
  ok(res.ok && filaD(d2.id).estado === "cancelado", "y apenas se aprueba, la cancelación sale");

  // c. el documento fue rechazado / ya cancelado: no hace falta
  limpiar();
  let d3 = doc({ estado: "rechazado" }); let e3 = nuevoEvento(d3);
  res = await envio.enviarEvento(storeId, e3.id, { transporte, ahora: AHORA });
  ok(res.ok && res.estado === "omitido" && filaE(e3.id).estado === "omitido" && llamadas.length === 0, "un documento RECHAZADO no existe en la DNIT: no hay nada que cancelar (queda «omitido», sin enviar)");
  let d3b = doc({ estado: "cancelado" }); let e3b = nuevoEvento(d3b);
  res = await envio.enviarEvento(storeId, e3b.id, { transporte, ahora: AHORA });
  ok(res.ok && res.estado === "omitido" && llamadas.length === 0, "uno ya cancelado, tampoco");
  let e3c = nuevoEvento({ id: "no-existe", cdc: CDC });
  res = await envio.enviarEvento(storeId, e3c.id, { transporte, ahora: AHORA });
  ok(res.ok && res.estado === "omitido", "y uno cuyo documento ya no existe, tampoco");

  // d. fuera de plazo (48 horas)
  limpiar();
  let d4 = doc({ procesadoEn: new Date(AHORA.getTime() - 49 * 3600_000) }); let e4 = nuevoEvento(d4);
  res = await envio.enviarEvento(storeId, e4.id, { transporte, ahora: AHORA });
  ok(res.ok && res.estado === "rechazado" && res.mensaje.includes("48 horas") && filaE(e4.id).respuestaCodigo === "4009" && llamadas.length === 0 && filaD(d4.id).estado === "aprobado", "pasadas las 48 horas desde la aprobación no se envía: queda rechazado (4009) con la explicación de que corresponde una nota de crédito, y el documento sigue aprobado");

  // e. la DNIT la rechaza / ya estaba pedida
  limpiar();
  let d5 = doc(); let e5 = nuevoEvento(d5);
  cola.push(responde(respEvento("Rechazado", "4004", "Documento con conformidad del receptor", { prot: null })));
  res = await envio.enviarEvento(storeId, e5.id, { transporte, ahora: AHORA });
  ok(res.ok && res.estado === "rechazado" && filaE(e5.id).estado === "rechazado" && filaE(e5.id).respuestaCodigo === "4004" && filaD(d5.id).estado === "aprobado", "rechazada por la DNIT: queda rechazada con su código y el documento NO cambia");
  limpiar();
  let d6 = doc(); let e6 = nuevoEvento(d6);
  cola.push(responde(respEvento("Rechazado", "4003", "El DTE ya se encuentra con un evento solicitado", { prot: null })));
  res = await envio.enviarEvento(storeId, e6.id, { transporte, ahora: AHORA });
  ok(res.ok && res.estado === "aprobado" && filaD(d6.id).estado === "cancelado", "«ya estaba pedida» (4003) cuenta como hecha: el evento ya figura en la DNIT");

  // f. sin comunicación: se reintenta con el MISMO evento firmado
  limpiar();
  let d7 = doc(); let e7 = nuevoEvento(d7);
  cola.push(sinRed());
  res = await envio.enviarEvento(storeId, e7.id, { transporte, ahora: AHORA });
  const xml1 = filaE(e7.id).xmlFirmado, id1 = filaE(e7.id).idEvento;
  ok(!res.ok && res.motivo === "comunicacion" && filaE(e7.id).estado === "pendiente" && filaE(e7.id).intentos === 1 && filaE(e7.id).errorEnvio.includes("ETIMEDOUT") && filaE(e7.id).proximoIntentoEn.getTime() === AHORA.getTime() + 60_000, "sin conexión: sigue pendiente, anota el problema y se reintenta en 1 minuto");
  cola.push(responde(respEvento("Aprobado", "0600", "ok", { prot: "8800017" })));
  res = await envio.enviarEvento(storeId, e7.id, { transporte, ahora: new Date(AHORA.getTime() + 61_000) });
  ok(res.ok && filaE(e7.id).xmlFirmado === xml1 && filaE(e7.id).idEvento === id1 && filaD(d7.id).estado === "cancelado" && filaE(e7.id).intentos === 2, "el reintento manda el mismo XML firmado y el mismo identificador (no vuelve a firmar) y se aprueba");
  limpiar();
  for (const [nombre, comportamiento] of [["HTTP 503", responde("<html>503</html>", 503)], ["error SOAP", responde(soap("<env:Fault><env:Reason><env:Text>boom</env:Text></env:Reason></env:Fault>"), 500)], ["sin estado", responde(respEvento("", "0999", "???", { prot: null }))]]) {
    const d = doc(); const e = nuevoEvento(d); cola.push(comportamiento);
    const rr = await envio.enviarEvento(storeId, e.id, { transporte, ahora: AHORA });
    ok(!rr.ok && rr.motivo === "comunicacion" && filaE(e.id).estado === "pendiente" && filaD(d.id).estado === "aprobado", nombre + ": nunca se da por hecho ni por rechazado; queda pendiente");
  }

  // g. inutilización
  limpiar();
  let eI = nuevoEvento({ id: null, cdc: null }, { tipo: "inutilizacion", documentoId: null, cdc: null, timbrado: "80012345", establecimiento: "001", punto: "001", numeroDesde: 47, numeroHasta: 47, tipoDocumento: 1, motivo: "Documento rechazado por la DNIT" });
  cola.push(responde(respEvento("Aprobado", "0600", "ok", { prot: "8800020" })));
  res = await envio.enviarEvento(storeId, eI.id, { transporte, ahora: AHORA });
  ok(res.ok && res.estado === "aprobado" && filaE(eI.id).estado === "aprobado" && llamadas.length === 1 && llamadas[0].cuerpo.includes("<rGeVeInu>") && (await validar(interior(llamadas[0].cuerpo))).valid, "inutilización: se firma, se envía (cumple el esquema) y queda aprobada");
  limpiar();
  let eI2 = nuevoEvento({ id: null, cdc: null }, { tipo: "inutilizacion", documentoId: null, cdc: null, timbrado: "80012345", establecimiento: "001", punto: "001", numeroDesde: 50, numeroHasta: 52, tipoDocumento: 1, motivo: "Saltos de numeración" });
  cola.push(responde(respEvento("Rechazado", "4065", "Para el rango solicitado existe DTE en SIFEN", { prot: null })));
  res = await envio.enviarEvento(storeId, eI2.id, { transporte, ahora: AHORA });
  ok(res.ok && res.estado === "rechazado" && filaE(eI2.id).respuestaCodigo === "4065", "si en el rango hay documentos aprobados, la DNIT la rechaza (4065) y queda así");
  limpiar();
  let eI3 = nuevoEvento({ id: null, cdc: null }, { tipo: "inutilizacion", documentoId: null, cdc: null, timbrado: "80012345", establecimiento: "001", punto: "001", numeroDesde: 60, numeroHasta: 60, tipoDocumento: 1, motivo: "Ya inutilizado antes" });
  cola.push(responde(respEvento("Rechazado", "4066", "Existen números ya inutilizados", { prot: null })));
  res = await envio.enviarEvento(storeId, eI3.id, { transporte, ahora: AHORA });
  ok(res.ok && res.estado === "aprobado", "«los números ya estaban inutilizados» (4066) cuenta como hecho");
  limpiar();
  let eMal = nuevoEvento({ id: null, cdc: null }, { tipo: "inutilizacion", documentoId: null, cdc: null, timbrado: "123", establecimiento: "001", punto: "001", numeroDesde: 1, numeroHasta: 1, tipoDocumento: 1, motivo: "datos mal cargados" });
  res = await envio.enviarEvento(storeId, eMal.id, { transporte, ahora: AHORA });
  ok(res.ok && res.estado === "rechazado" && res.mensaje.includes("8 dígitos") && llamadas.length === 0 && filaE(eMal.id).estado === "rechazado", "datos que no se pueden firmar (timbrado mal): se rechaza en el acto, con el motivo, sin molestar a la DNIT ni reintentar");
  limpiar();
  BF.tablas.certificadoFirma = [];
  let dSC = doc(); let eSC = nuevoEvento(dSC);
  res = await envio.enviarEvento(storeId, eSC.id, { transporte, ahora: AHORA });
  ok(!res.ok && res.motivo === "comunicacion" && res.mensaje.includes("certificado") && filaE(eSC.id).estado === "pendiente" && filaE(eSC.id).xmlFirmado === null && llamadas.length === 0, "sin certificado: no firma ni envía, avisa y queda pendiente");
  BF.tablas.certificadoFirma = [{ id: "c1", storeId, activo: true, validoHasta: new Date(Date.now() + 200 * 864e5), certificadoBase64: leido.certificadoBase64, cadenaPem: [], clavePrivadaCifrada: await certLib.cifrarSecreto(leido.clavePrivadaPem, claveMaestra, storeId), createdAt: new Date() }];
  let eOtro = nuevoEvento(doc(), { storeId: "otro-local" });
  res = await envio.enviarEvento(storeId, eOtro.id, { transporte, ahora: AHORA });
  ok(!res.ok && res.motivo === "no_corresponde" && llamadas.length === 0, "un evento de OTRO local no se toca");

  // h. la tarea programada: documentos primero y eventos después, en la misma corrida
  window.log("== Tarea programada con eventos");
  limpiar();
  BF.tablas.documentoElectronico = []; BF.tablas.eventoElectronico = [];
  let dP = doc({ estado: "firmado", enviadoEn: null, procesadoEn: null, xmlFirmado: "<rDE/>" });
  let eP = nuevoEvento(dP);
  const soapProt = (cdc) => soap(`<rRetEnviDe xmlns="${NS}"><rProtDe><Id>${cdc}</Id><dFecProc>2026-10-09T15:00:05-03:00</dFecProc><dEstRes>Aprobado</dEstRes><dProtAut>7000001</dProtAut><gResProc><dCodRes>0260</dCodRes><dMsgRes>Autorización del DE satisfactoria</dMsgRes></gResProc></rProtDe></rRetEnviDe>`);
  cola.push(responde(soapProt(dP.cdc)));
  cola.push(responde(respEvento("Aprobado", "0600", "ok", { prot: "8800030" })));
  const resumen = await envio.procesarPendientes({ transporte, ahora: AHORA, limite: 10 });
  igual([resumen.revisados, resumen.aprobados, resumen.eventos.revisados, resumen.eventos.aprobados, resumen.eventos.esperando], [1, 1, 1, 1, 0], "en UNA corrida: se envía el documento, la DNIT lo aprueba y enseguida sale su cancelación");
  ok(filaD(dP.id).estado === "cancelado" && filaE(eP.id).estado === "aprobado" && llamadas.map((l) => l.servicio).join() === "recibe,evento", "en ese orden (primero la recepción, después el evento) y el documento termina cancelado");
  limpiar();
  let dQ = doc({ estado: "firmado", enviadoEn: null, procesadoEn: null, proximoIntentoEn: new Date(AHORA.getTime() + 3600_000) }); let eQ = nuevoEvento(dQ);
  const r2 = await envio.procesarPendientes({ transporte, ahora: AHORA, limite: 10 });
  igual([r2.revisados, r2.eventos.revisados, r2.eventos.esperando], [0, 1, 1], "si el documento todavía no se pudo enviar, el evento queda esperando (no se manda antes de tiempo)");
  limpiar();
  BF.tablas.eventoElectronico = [];
  const dos = [nuevoEvento(doc()), nuevoEvento(doc()), nuevoEvento(doc()), nuevoEvento(doc())];
  for (let i = 0; i < 4; i++) cola.push(responde(respEvento("Aprobado", "0600", "ok", { prot: "88" + i })));
  const [x, y] = await Promise.all([envio.procesarPendientes({ transporte, ahora: AHORA }), envio.procesarPendientes({ transporte, ahora: AHORA })]);
  ok(llamadas.filter((l) => l.servicio === "evento").length === 4 && x.eventos.aprobados + y.eventos.aprobados === 4, "dos corridas a la vez: cada evento se envía una sola vez (" + (x.eventos.aprobados + y.eventos.aprobados) + " aprobados, " + llamadas.length + " llamadas)");

  // i. anular una factura electrónica pide la cancelación (comprobante.ts)
  window.log("== Anular una factura electrónica");
  limpiar();
  BF.tablas.documentoElectronico = []; BF.tablas.eventoElectronico = []; BF.tablas.comprobante = [];
  const compro = await C.cargar("src/lib/comprobante");
  const dEl = doc({ id: "doc-el" });
  BF.tablas.comprobante = [
    { id: "cmp1", storeId, ventaPosId: "venta-1", estado: "vigente", modalidad: "electronico", documentoElectronico: { id: dEl.id } },
    { id: "cmp2", storeId, ventaPosId: "venta-2", estado: "vigente", modalidad: "autoimpresor", documentoElectronico: null },
    { id: "cmp3", storeId, ventaPosId: "venta-3", estado: "vigente", modalidad: "electronico", documentoElectronico: null },
  ];
  await compro.anularComprobantes(BF.db, { storeId, origen: { ventaPosId: "venta-1" }, por: "Ariel", en: AHORA, motivo: "El cliente se fue sin pagar" });
  ok(BF.tablas.comprobante[0].estado === "anulado" && eventos().length === 1 && eventos()[0].documentoId === "doc-el" && eventos()[0].motivo === "El cliente se fue sin pagar" && eventos()[0].creadoPor === "Ariel", "al anular una factura electrónica queda pedida la cancelación en la DNIT, con el motivo y quién la anuló");
  await compro.anularComprobantes(BF.db, { storeId, origen: { ventaPosId: "venta-2" }, por: "Ariel", en: AHORA, motivo: "x" });
  await compro.anularComprobantes(BF.db, { storeId, origen: { ventaPosId: "venta-3" }, por: "Ariel", en: AHORA, motivo: "x" });
  ok(BF.tablas.comprobante[1].estado === "anulado" && BF.tablas.comprobante[2].estado === "anulado" && eventos().length === 1, "una autoimpresor (o una electrónica sin documento) se anula como siempre, sin pedir nada a la DNIT");
  await compro.anularComprobantes(BF.db, { storeId, origen: { ventaPosId: "venta-1" }, por: "Ariel", en: AHORA, motivo: "otra vez" });
  ok(eventos().length === 1, "anular de nuevo lo ya anulado no duplica la cancelación");

  window.log("\naciertos: " + window.__aciertos + " · fallas: " + window.__fallas);
  window.__listo = true;
})().catch((e) => { document.getElementById("salida").textContent += "\nERROR: " + (e && e.stack || e); window.__listo = true; window.__fallas = (window.__fallas || 0) + 1; });
