// Prueba del envío de las facturas electrónicas a la DNIT: los mensajes SOAP (validados contra los esquemas oficiales con libxml2), la lectura
// de las respuestas y toda la lógica de estados y reintentos (src/lib/sifen/ws.ts y envio.ts), contra una DNIT simulada y una base en memoria.
(async () => {
  const { ok, igual } = window;
  const C = window.Cargador;
  const S = C.simulacros;
  S["node-forge"] = window.forge;
  const forge = window.forge;
  const BF = window.BaseFalsa;

  // ---------------------------------------------------------------- jueces: libxml2 con los esquemas oficiales de los servicios web
  const { validateXML } = await import("/xmllint/index-browser.mjs");
  const leer = async (n) => (await fetch("/xsd-test/" + n)).text();
  const reescribir = (t) => t.replace(/schemaLocation\s*=\s*"https:\/\/ekuatia\.set\.gov\.py\/sifen\/xsd\/([^"]+)"/g, 'schemaLocation="$1"');
  const todos = ["DE_v150.xsd", "DE_Types_v150.xsd", "Paises_v100.xsd", "Departamentos_v141.xsd", "Monedas_v150.xsd", "Unidades_Medida_v141.xsd", "xmldsig-core-schema.xsd", "protProcesDE_v150.xsd", "SIFEN_Types_v141.xsd", "FE_Types_v141.xsd", "protProcesEventos_v141.xsd", "Evento_v150.xsd", "Evento_Types_v150.xsd"];
  const preload = []; for (const n of todos) preload.push({ fileName: n, contents: reescribir(await leer(n)) });
  const principal = {}; for (const n of ["WS_SiRecepDE_v150.xsd", "WS_SiConsDE_v141.xsd"]) principal[n] = reescribir(await leer(n));
  const validar = async (xml, esquema) => validateXML({ xml: [{ fileName: "m.xml", contents: xml }], schema: [{ fileName: esquema, contents: principal[esquema] }], preload });
  const interior = (sobre) => /<env:Body>([\s\S]*)<\/env:Body>/.exec(sobre)[1];

  // ---------------------------------------------------------------- un documento firmado de verdad (con el certificado de OpenSSL de las muestras)
  const claveMaestra = forge.util.encode64(forge.random.getBytesSync(32));
  window.process = { env: { CERTIFICADOS_CLAVE: claveMaestra } };
  const certLib = await C.cargar("src/lib/sifen/certificado");
  const firma = await C.cargar("src/lib/sifen/firma");
  const armar = await C.cargar("src/lib/sifen/armar-de");
  const cod = await C.cargar("src/lib/sifen-codigos");
  const muestras = window.MUESTRAS_P12;
  const leido = certLib.leerCertificadoP12(muestras.moderno, muestras.clave).certificado;
  const storeId = "local-1";
  const dv = (n) => cod.calcularDvRuc(String(n));
  const emisorDatos = { tipoContribuyente: "persona_juridica", tipoRegimen: null, nombreFantasia: "Lo de Fabri", denominacionSucursal: "Casa central", telefono: "0981123456", email: "fabri@correo.com.py", direccion: "Av. Mariscal López", numeroCasa: "1234", complemento: null, departamento: "capital", distritoCodigo: 1, distrito: null, ciudadCodigo: 1, ciudad: null, actividades: [{ codigo: "56101", descripcion: "Restaurantes y parrillas" }] };
  const items = [{ codigo: "p1", descripcion: "Pizza", unidadMedida: "unidad", cantidad: 2, precioUnitario: 55000, descuento: 0, total: 110000, iva: "gravado10" }];
  const comprobante = { tipo: "factura", modalidad: "electronico", tipoEmision: "normal", timbrado: "80012345", timbradoDesde: new Date("2026-01-01T03:00:00Z"), establecimiento: "001", punto: "001", correlativo: 47, numero: "001-001-0000047", fechaEmision: new Date("2026-10-09T17:30:05Z"), tipoTransaccion: "venta_mercaderia", moneda: "PYG", emisorRuc: "80012345-" + dv("80012345"), emisorRazonSocial: "Fabri S.A.", emisorDatos, receptorTipoIdentificacion: "ruc", receptorNumeroIdentificacion: "80069563-" + dv("80069563"), receptorRazonSocial: "Cliente de Prueba S.A.", receptorEmail: null, presencia: "presencial", condicion: "contado", fechaVencimientoCredito: null, items, total: 110000 };
  const armado = armar.armarDE(comprobante, [{ forma: "efectivo", monto: 110000 }], { ambiente: "pruebas", fechaFirma: new Date("2026-10-09T17:31:00Z"), codigoSeguridad: "587326098" });
  const F = await firma.firmarDocumento(armado.de, { clavePrivadaPkcs8: firma.pemADer(leido.clavePrivadaPem), certificadoBase64: leido.certificadoBase64 }, { csc: "ABCD0000000000000000000000000000", idCsc: "0001", produccion: false });

  // ---------------------------------------------------------------- los mensajes
  const ws = await C.cargar("src/lib/sifen/ws");
  window.log("== Mensajes que se envían (validados contra los esquemas oficiales)");
  const sobre = ws.sobreSoap(ws.cuerpoRecepcionDE(1760000000012, F.xml));
  ok(sobre.startsWith('<?xml version="1.0" encoding="UTF-8"?><env:Envelope xmlns:env="http://www.w3.org/2003/05/soap-envelope"><env:Header/><env:Body><rEnviDe xmlns="http://ekuatia.set.gov.py/sifen/xsd"><dId>1760000000012</dId><xDE><rDE '), "SOAP 1.2: Envelope con su Header y Body, <rEnviDe> con el número de control y el <rDE> dentro de <xDE>");
  ok(!sobre.includes("<?xml", 5) && sobre.includes("</rDE></xDE></rEnviDe></env:Body></env:Envelope>"), "el documento va sin su declaración XML (una sola en todo el mensaje)");
  const vr = await validar(interior(sobre), "WS_SiRecepDE_v150.xsd");
  ok(vr.valid, "libxml2: <rEnviDe> cumple WS_SiRecepDE_v150.xsd" + (vr.valid ? "" : " -> " + vr.errors.map((e) => e.message).join(" | ").slice(0, 300)));
  const inyectado = ws.cuerpoRecepcionDE(1, F.xml.replace("<rDE ", "<rDE a=\"1\" "));
  ok(inyectado.includes('<rDE a="1"'), "lo que va dentro de <xDE> es el archivo firmado tal cual (no se toca ni un byte: la firma depende de eso)");
  const rCons = await validar(interior(ws.sobreSoap(ws.cuerpoConsultaDE(1760000000013, F.cdc))), "WS_SiConsDE_v141.xsd");
  ok(rCons.valid, "libxml2: <rEnviConsDeRequest> cumple WS_SiConsDE_v141.xsd" + (rCons.valid ? "" : " -> " + rCons.errors.map((e) => e.message).join(" | ").slice(0, 300)));
  const ids = new Set(); for (let i = 0; i < 2000; i++) ids.add(ws.nuevoIdDeEnvio(new Date(1760000000000)));
  ok(ids.size === 2000 || ids.size >= 100, "números de control: ni repetidos en el mismo milisegundo (hasta 100) ni de más de 15 dígitos");
  ok([...ids].every((n) => String(n).length <= 15), "todos de 15 dígitos o menos (dId: totalDigits 15)");
  igual(ws.urlsDelServicio("recibe", "pruebas"), ["https://sifen-test.set.gov.py/de/ws/sync/recibe.wsdl", "https://sifen-test.set.gov.py/de/ws/sync/recibe"], "direcciones de recepción en pruebas (la del manual y la misma sin «.wsdl»)");
  igual(ws.urlsDelServicio("consulta", "produccion")[1], "https://sifen.set.gov.py/de/ws/consultas/consulta", "y las de consulta en producción");

  // ---------------------------------------------------------------- lo que contestan
  window.log("== Respuestas de la DNIT");
  const NS = "http://ekuatia.set.gov.py/sifen/xsd";
  const soap = (c) => `<?xml version="1.0" encoding="UTF-8"?><env:Envelope xmlns:env="http://www.w3.org/2003/05/soap-envelope"><env:Header/><env:Body>${c}</env:Body></env:Envelope>`;
  const resultados = (rs) => rs.map(([c, m]) => `<gResProc><dCodRes>${c}</dCodRes><dMsgRes>${m}</dMsgRes></gResProc>`).join("");
  const protocolo = ({ cdc = F.cdc, estado, prot = "1234567890", rs, prefijo = false }) => {
    const p = prefijo ? "ns2:" : "";
    const dentro = `<${p}rProtDe><${p}Id>${cdc}</${p}Id><${p}dFecProc>2026-10-09T14:31:07-03:00</${p}dFecProc><${p}dDigVal>${F.digestValue}</${p}dDigVal><${p}dEstRes>${estado}</${p}dEstRes>${prot ? `<${p}dProtAut>${prot}</${p}dProtAut>` : ""}${(rs || []).map(([c, m]) => `<${p}gResProc><${p}dCodRes>${c}</${p}dCodRes><${p}dMsgRes>${m}</${p}dMsgRes></${p}gResProc>`).join("")}</${p}rProtDe>`;
    return soap(prefijo ? `<ns2:rRetEnviDe xmlns:ns2="${NS}">${dentro}</ns2:rRetEnviDe>` : `<rRetEnviDe xmlns="${NS}">${dentro}</rRetEnviDe>`);
  };
  const aprobado = protocolo({ estado: "Aprobado", rs: [["0260", "Autorización del DE satisfactoria"]] });
  const vRes = await validar(interior(aprobado), "WS_SiRecepDE_v150.xsd");
  ok(vRes.valid, "libxml2: la respuesta de ejemplo cumple <rRetEnviDe> del esquema oficial (así sabemos que nuestro modelo de respuesta es el real)" + (vRes.valid ? "" : " -> " + vRes.errors.map((e) => e.message).join(" | ").slice(0, 300)));
  let r = ws.leerRespuestaRecepcion(aprobado);
  igual([r.tipo, r.protocolo.estado, r.protocolo.protocoloAutorizacion, r.protocolo.cdc, r.protocolo.resultados, r.protocolo.procesadoEn.toISOString()], ["protocolo", "aprobado", "1234567890", F.cdc, [{ codigo: "0260", mensaje: "Autorización del DE satisfactoria" }], "2026-10-09T17:31:07.000Z"], "Aprobado: estado, protocolo de autorización, CDC, código y mensaje, y la hora de proceso");
  r = ws.leerRespuestaRecepcion(protocolo({ estado: "Aprobado", prefijo: true, rs: [["0260", "ok"]] }));
  ok(r.tipo === "protocolo" && r.protocolo.estado === "aprobado", "también cuando la respuesta viene con prefijo de espacio de nombres (ns2:)");
  r = ws.leerRespuestaRecepcion(protocolo({ estado: "Aprobado con observación", rs: [["0260", "Autorizado"], ["2001", "Observación X"]] }));
  ok(r.protocolo.estado === "aprobado_con_observacion" && r.protocolo.resultados.length === 2, "«Aprobado con observación» (con tilde) y varios mensajes");
  igual(ws.estadoDeTexto("APROBADO CON OBSERVACION"), "aprobado_con_observacion", "el estado se reconoce sin importar tildes ni mayúsculas");
  r = ws.leerRespuestaRecepcion(protocolo({ estado: "Rechazado", prot: null, rs: [["1000", "CDC no corresponde con las informaciones del XML"]] }));
  ok(r.protocolo.estado === "rechazado" && r.protocolo.protocoloAutorizacion === null && r.protocolo.resultados[0].codigo === "1000", "Rechazado: sin protocolo y con el código del motivo");
  r = ws.leerRespuestaRecepcion(soap('<env:Fault><env:Code><env:Value>env:Sender</env:Value></env:Code><env:Reason><env:Text xml:lang="en">Certificado no autorizado</env:Text></env:Reason></env:Fault>'));
  igual([r.tipo, r.motivo], ["falla", "Certificado no autorizado"], "un error SOAP (Fault) se reconoce y se lee su motivo");
  ok(ws.leerRespuestaRecepcion("<html><body>503 Servicio no disponible</body></html>").tipo === "ilegible", "un HTML de error del servidor no es un protocolo");
  ok(ws.leerRespuestaRecepcion("").tipo === "ilegible" && ws.leerRespuestaRecepcion("<a><b></a>").tipo === "ilegible", "una respuesta vacía o mal formada tampoco");
  ok(ws.leerRespuestaRecepcion('<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "bomba">]><r>&a;</r>').tipo === "ilegible", "un XML con DOCTYPE (entidades propias) se rechaza: nada de XXE ni de entidades que explotan");
  const consulta = (codigo, mensaje, contenido) => soap(`<rEnviConsDeResponse xmlns="${NS}"><dFecProc>2026-10-09T14:35:00-03:00</dFecProc><dCodRes>${codigo}</dCodRes><dMsgRes>${mensaje}</dMsgRes>${contenido ? `<xContenDE>${contenido}</xContenDE>` : ""}</rEnviConsDeResponse>`);
  const vC = await validar(interior(consulta("0422", "CDC encontrado", "x")), "WS_SiConsDE_v141.xsd");
  ok(vC.valid, "libxml2: la respuesta de consulta de ejemplo cumple el esquema oficial" + (vC.valid ? "" : " -> " + vC.errors.map((e) => e.message).join(" | ").slice(0, 200)));
  let c = ws.leerRespuestaConsulta(consulta("0422", "CDC encontrado", "&lt;rContDe&gt;&lt;dProtAut&gt;5550001&lt;/dProtAut&gt;&lt;/rContDe&gt;"));
  ok(c.tipo === "consulta" && c.existe && c.protocoloAutorizacion === "5550001", "consulta 0422: el documento existe y se saca su número de transacción del contenido");
  c = ws.leerRespuestaConsulta(consulta("0420", "CDC inexistente"));
  ok(c.tipo === "consulta" && !c.existe && c.codigo === "0420", "consulta 0420: no existe");

  // ---------------------------------------------------------------- el envío
  window.log("== Envío y estados");
  BF.reiniciar();
  // Como en el sistema real, el cliente de un local solo ve las filas de ese local (es el mismo filtro: src/lib/alcance-local.ts).
  const alcance = await C.cargar("src/lib/alcance-local");
  BF.instalar(S, (id) => new Proxy({}, { get: (_, nombre) => new Proxy({}, { get: (__, op) => (args) => BF.db[nombre][op](alcance.aplicarLocal(nombre[0].toUpperCase() + nombre.slice(1), op, args, id)) }) }));
  S["node:https"] = { request: () => { throw new Error("En las pruebas no hay red: el transporte se reemplaza por una DNIT simulada"); } };
  const envio = await C.cargar("src/lib/sifen/envio");
  const ahora0 = new Date("2026-10-09T18:00:00Z");
  const sembrarBoveda = async () => {
    BF.tablas.certificadoFirma = [{ id: "c1", storeId, activo: true, validoHasta: new Date(Date.now() + 200 * 864e5), certificadoBase64: leido.certificadoBase64, cadenaPem: [], clavePrivadaCifrada: await certLib.cifrarSecreto(leido.clavePrivadaPem, claveMaestra, storeId), createdAt: new Date() }];
  };
  await sembrarBoveda();
  let n = 0;
  const cdcFalso = () => String(1000 + ++n).padStart(44, "0");
  const doc = (extra = {}) => { const fila = { id: "d" + ++n, storeId, comprobanteId: "c" + n, cdc: cdcFalso(), ambiente: "pruebas", vistaPrevia: false, estado: "firmado", xmlFirmado: F.xml, digestValue: F.digestValue, urlQr: F.urlQr, huellaCertificado: "h", firmadoEn: new Date(ahora0.getTime() - 60_000), firmadoPor: "t", enviadoEn: null, respuestaCodigo: null, respuestaMensaje: null, protocoloAutorizacion: null, procesadoEn: null, errorEnvio: null, intentos: 0, proximoIntentoEn: null, ...extra }; BF.tablas.documentoElectronico = [...(BF.tablas.documentoElectronico || []), fila]; return fila; };
  const filaDe = (id) => BF.tablas.documentoElectronico.find((f) => f.id === id);

  // La DNIT simulada: una cola de comportamientos por servicio; cada llamada queda anotada.
  const llamadas = [];
  const cola = { recibe: [], consulta: [] };
  const transporte = async (p) => {
    llamadas.push({ servicio: p.servicio, ambiente: p.ambiente, cuerpo: p.cuerpo, certificado: p.certificadoPem, clave: p.clavePem });
    const siguiente = cola[p.servicio].shift();
    if (!siguiente) throw new Error("La DNIT simulada no tenía preparada una respuesta para " + p.servicio);
    return siguiente(p);
  };
  const responde = (cuerpo, status = 200) => async () => ({ status, cuerpo, url: "simulada" });
  const sinRed = (mensaje = "connect ETIMEDOUT 200.1.2.3:443") => async () => { throw new Error(mensaje); };
  const limpiarLlamadas = () => { llamadas.length = 0; cola.recibe.length = 0; cola.consulta.length = 0; };

  // 1. aprobado
  let d1 = doc();
  cola.recibe.push(responde(protocolo({ cdc: d1.cdc, estado: "Aprobado", prot: "9990001", rs: [["0260", "Autorización del DE satisfactoria"]] })));
  let res = await envio.enviarDocumento(storeId, d1.id, { transporte, ahora: ahora0 });
  igual([res.ok, res.estado, res.protocolo], [true, "aprobado", "9990001"], "aprobado: el resultado trae el estado y el protocolo");
  let f = filaDe(d1.id);
  ok(f.estado === "aprobado" && f.protocoloAutorizacion === "9990001" && f.intentos === 1 && f.enviadoEn && f.procesadoEn && f.errorEnvio === null && f.proximoIntentoEn === null && f.respuestaCodigo === "0260", "queda aprobado, con su protocolo, sin errores pendientes ni nuevo intento");
  ok(llamadas.length === 1 && llamadas[0].servicio === "recibe" && llamadas[0].ambiente === "pruebas", "una sola llamada, a recepción y en el ambiente del documento");
  ok(llamadas[0].certificado.startsWith("-----BEGIN CERTIFICATE-----") && llamadas[0].clave.startsWith("-----BEGIN PRIVATE KEY-----"), "la conexión se presenta con el certificado y la clave (descifrada de la bóveda) en PEM");
  const cuerpoEnviado = llamadas[0].cuerpo;
  ok(cuerpoEnviado.includes(`<xDE>${F.xml.replace(/^<\?xml[^>]*\?>/, "")}</xDE>`), "se envió exactamente el XML firmado que se guardó");
  ok((await validar(interior(cuerpoEnviado), "WS_SiRecepDE_v150.xsd")).valid, "y lo enviado cumple el esquema oficial de recepción");
  res = await envio.enviarDocumento(storeId, d1.id, { transporte, ahora: ahora0 });
  ok(res.ok === false && res.motivo === "no_corresponde" && llamadas.length === 1, "un documento ya aprobado no se vuelve a enviar");

  // 2. aprobado con observación
  limpiarLlamadas();
  let d2 = doc();
  cola.recibe.push(responde(protocolo({ cdc: d2.cdc, estado: "Aprobado con observación", prot: "9990002", rs: [["0260", "Autorizado"], ["2201", "El teléfono del receptor no es válido"]] })));
  res = await envio.enviarDocumento(storeId, d2.id, { transporte, ahora: ahora0 });
  f = filaDe(d2.id);
  ok(f.estado === "aprobado_con_observacion" && f.respuestaMensaje.includes("2201: El teléfono del receptor no es válido") && f.protocoloAutorizacion === "9990002", "aprobado con observación: queda guardada la observación para verla");

  // 3. rechazado
  limpiarLlamadas();
  let d3 = doc();
  cola.recibe.push(responde(protocolo({ cdc: d3.cdc, estado: "Rechazado", prot: null, rs: [["1000", "CDC no corresponde con las informaciones del XML"]] })));
  res = await envio.enviarDocumento(storeId, d3.id, { transporte, ahora: ahora0 });
  f = filaDe(d3.id);
  ok(res.ok && res.estado === "rechazado" && f.estado === "rechazado" && f.respuestaCodigo === "1000" && f.respuestaMensaje.includes("CDC no corresponde") && f.proximoIntentoEn === null, "rechazado: queda rechazado con su código y motivo, y NO se reintenta (hay que corregir y emitir otro)");
  res = await envio.enviarDocumento(storeId, d3.id, { transporte, ahora: ahora0 });
  ok(res.ok === false && res.motivo === "no_corresponde" && llamadas.length === 1, "y no se vuelve a mandar");

  // 4. sin comunicación: se reintenta solo, cada vez más espaciado
  limpiarLlamadas();
  let d4 = doc();
  cola.recibe.push(sinRed());
  res = await envio.enviarDocumento(storeId, d4.id, { transporte, ahora: ahora0 });
  f = filaDe(d4.id);
  ok(res.ok === false && res.motivo === "comunicacion" && f.estado === "firmado" && f.intentos === 1 && f.errorEnvio.includes("ETIMEDOUT") && f.enviadoEn, "sin conexión: NO es un rechazo; sigue firmado, anota el problema y que ya se intentó");
  ok(f.proximoIntentoEn.getTime() === ahora0.getTime() + 60_000, "el primer reintento es en 1 minuto");
  const esperas = [];
  let ahora = ahora0;
  for (let i = 0; i < 9; i++) {
    ahora = new Date(filaDe(d4.id).proximoIntentoEn.getTime());
    cola.consulta.push(sinRed());
    await envio.enviarDocumento(storeId, d4.id, { transporte, ahora });
    esperas.push((filaDe(d4.id).proximoIntentoEn.getTime() - ahora.getTime()) / 60_000);
  }
  igual(esperas, [2, 5, 10, 20, 40, 60, 120, 120, 120], "las esperas crecen (1, 2, 5, 10, 20, 40, 60, 120 minutos) y se quedan en 2 horas");
  igual([envio.minutosHastaReintento(1), envio.minutosHastaReintento(8), envio.minutosHastaReintento(50), envio.minutosHastaReintento(0)], [1, 120, 120, 1], "la función de espera es la misma y no se sale de la tabla");

  // 5. el intento anterior SÍ había llegado: se averigua antes de reenviar
  limpiarLlamadas();
  let d5 = doc({ enviadoEn: new Date(ahora0.getTime() - 120_000), intentos: 1, errorEnvio: "timeout", proximoIntentoEn: new Date(ahora0.getTime() - 1000) });
  cola.consulta.push(responde(consulta("0422", "CDC encontrado", "&lt;dProtAut&gt;7770001&lt;/dProtAut&gt;")));
  res = await envio.enviarDocumento(storeId, d5.id, { transporte, ahora: ahora0 });
  f = filaDe(d5.id);
  ok(res.ok && res.estado === "aprobado" && f.estado === "aprobado" && f.protocoloAutorizacion === "7770001" && llamadas.length === 1 && llamadas[0].servicio === "consulta", "tras un intento sin respuesta, primero CONSULTA por el CDC: si ya existe lo da por aprobado y no reenvía (cero duplicados)");
  ok(llamadas[0].cuerpo.includes(`<dCDC>${d5.cdc}</dCDC>`) && (await validar(interior(llamadas[0].cuerpo), "WS_SiConsDE_v141.xsd")).valid, "la consulta lleva el CDC del documento y cumple el esquema");

  // 6. el intento anterior NO había llegado: se envía
  limpiarLlamadas();
  let d6 = doc({ enviadoEn: new Date(ahora0.getTime() - 120_000), intentos: 1, errorEnvio: "timeout" });
  cola.consulta.push(responde(consulta("0420", "CDC inexistente")));
  cola.recibe.push(responde(protocolo({ cdc: d6.cdc, estado: "Aprobado", prot: "9990006", rs: [["0260", "ok"]] })));
  res = await envio.enviarDocumento(storeId, d6.id, { transporte, ahora: ahora0 });
  ok(res.ok && res.estado === "aprobado" && filaDe(d6.id).intentos === 2 && llamadas.map((l) => l.servicio).join() === "consulta,recibe", "si la consulta dice que no existe, recién ahí se envía (consulta y después recepción)");
  limpiarLlamadas();
  let d6b = doc({ enviadoEn: new Date(ahora0.getTime() - 120_000), intentos: 1 });
  cola.consulta.push(sinRed("ENOTFOUND sifen-test.set.gov.py"));
  res = await envio.enviarDocumento(storeId, d6b.id, { transporte, ahora: ahora0 });
  ok(res.ok === false && res.motivo === "comunicacion" && llamadas.length === 1 && filaDe(d6b.id).estado === "firmado", "si ni la consulta se pudo hacer, NO se reenvía a ciegas: se espera y se reintenta");

  // 7. duplicado (1001 / 1002)
  limpiarLlamadas();
  let d7 = doc();
  cola.recibe.push(responde(protocolo({ cdc: d7.cdc, estado: "Rechazado", prot: null, rs: [["1001", "Ya fue autorizado otro documento con coincidencia simultánea de CDC"]] })));
  cola.consulta.push(responde(consulta("0422", "CDC encontrado", "&lt;dProtAut&gt;8880007&lt;/dProtAut&gt;")));
  res = await envio.enviarDocumento(storeId, d7.id, { transporte, ahora: ahora0 });
  ok(res.ok && res.estado === "aprobado" && filaDe(d7.id).protocoloAutorizacion === "8880007", "«ya fue autorizado» (1001): se consulta y, si es el mismo documento, queda aprobado");
  limpiarLlamadas();
  let d7b = doc();
  cola.recibe.push(responde(protocolo({ cdc: d7b.cdc, estado: "Rechazado", prot: null, rs: [["1002", "Documento electrónico duplicado"]] })));
  cola.consulta.push(responde(consulta("0420", "CDC inexistente")));
  res = await envio.enviarDocumento(storeId, d7b.id, { transporte, ahora: ahora0 });
  ok(res.ok && res.estado === "rechazado" && filaDe(d7b.id).estado === "rechazado", "si el CDC no existe, el duplicado es de OTRO documento: queda rechazado");

  // 8. respuestas raras: nunca se marcan como rechazadas
  limpiarLlamadas();
  const casos = [
    ["HTTP 503 con una página de error", responde("<html><body>Service Unavailable</body></html>", 503)],
    ["error SOAP", responde(soap("<env:Fault><env:Reason><env:Text>Internal error</env:Text></env:Reason></env:Fault>"), 500)],
    ["respuesta vacía", responde("", 200)],
    ["protocolo sin estado", responde(protocolo({ estado: "", prot: null, rs: [["0999", "???"]] }))],
  ];
  for (const [nombre, comportamiento] of casos) {
    const d = doc(); cola.recibe.push(comportamiento);
    const rr = await envio.enviarDocumento(storeId, d.id, { transporte, ahora: ahora0 });
    ok(rr.ok === false && rr.motivo === "comunicacion" && filaDe(d.id).estado === "firmado" && filaDe(d.id).errorEnvio, nombre + ": queda firmado, con el problema anotado y para reintentar");
  }
  const dFalla = doc(); cola.recibe.push(responde(soap("<env:Fault><env:Reason><env:Text>Certificado no autorizado</env:Text></env:Reason></env:Fault>"), 500));
  await envio.enviarDocumento(storeId, dFalla.id, { transporte, ahora: ahora0 });
  ok(filaDe(dFalla.id).errorEnvio.includes("Certificado no autorizado"), "el motivo del error SOAP queda a la vista");

  // 9. no corresponde
  limpiarLlamadas();
  const dPrev = doc({ vistaPrevia: true });
  res = await envio.enviarDocumento(storeId, dPrev.id, { transporte, ahora: ahora0 });
  ok(res.ok === false && res.motivo === "no_corresponde" && llamadas.length === 0 && filaDe(dPrev.id).estado === "firmado", "una vista previa de factura autoimpresor NUNCA se envía");
  res = await envio.enviarDocumento(storeId, "no-existe", { transporte, ahora: ahora0 });
  ok(res.ok === false && res.motivo === "no_corresponde", "un documento que no existe tampoco");
  const dOtro = doc({ storeId: "otro-local" });
  res = await envio.enviarDocumento(storeId, dOtro.id, { transporte, ahora: ahora0 });
  ok(res.ok === false && res.motivo === "no_corresponde" && llamadas.length === 0, "ni el de OTRO local (cada local ve solo lo suyo)");

  // 10. producción y fuera de plazo y sin certificado
  limpiarLlamadas();
  const dProd = doc({ ambiente: "produccion" });
  cola.recibe.push(responde(protocolo({ cdc: dProd.cdc, estado: "Aprobado", prot: "1", rs: [["0260", "ok"]] })));
  await envio.enviarDocumento(storeId, dProd.id, { transporte, ahora: ahora0 });
  ok(llamadas[0].ambiente === "produccion", "un documento firmado para producción va a producción");
  const dViejo = doc({ firmadoEn: new Date(ahora0.getTime() - 80 * 3600_000) });
  cola.recibe.push(sinRed("socket hang up"));
  await envio.enviarDocumento(storeId, dViejo.id, { transporte, ahora: ahora0 });
  ok(filaDe(dViejo.id).errorEnvio.startsWith("Pasaron más de 72 horas desde la emisión."), "pasadas las 72 horas del plazo de transmisión se avisa en el motivo (sigue reintentando)");
  BF.tablas.certificadoFirma = []; const llamadasAntes = llamadas.length;
  const dSinCert = doc();
  res = await envio.enviarDocumento(storeId, dSinCert.id, { transporte, ahora: ahora0 });
  ok(res.ok === false && res.mensaje.includes("certificado digital") && filaDe(dSinCert.id).estado === "firmado" && filaDe(dSinCert.id).enviadoEn === null && llamadas.length === llamadasAntes, "sin certificado cargado: no intenta nada, avisa y queda pendiente (y no cuenta como «enviado»)");
  await sembrarBoveda();

  // 11. la tarea programada
  window.log("== Tarea programada (todos los locales, sin pisarse)");
  limpiarLlamadas();
  BF.tablas.documentoElectronico = [];
  const futuro = doc({ proximoIntentoEn: new Date(ahora0.getTime() + 3_600_000) });
  const vencido = doc({ proximoIntentoEn: new Date(ahora0.getTime() - 1000), intentos: 2, enviadoEn: new Date(ahora0.getTime() - 5000) });
  const nuevo1 = doc(); const nuevo2 = doc();
  const previa = doc({ vistaPrevia: true });
  const yaAprobado = doc({ estado: "aprobado" });
  for (const x of [nuevo1, nuevo2]) cola.recibe.push(responde(protocolo({ cdc: x.cdc, estado: "Aprobado", prot: "55", rs: [["0260", "ok"]] })));
  cola.consulta.push(responde(consulta("0420", "CDC inexistente")));
  cola.recibe.push(responde(protocolo({ cdc: vencido.cdc, estado: "Rechazado", prot: null, rs: [["1000", "x"]] })));
  const resumen = await envio.procesarPendientes({ transporte, ahora: ahora0, limite: 10 });
  igual(resumen, { revisados: 3, aprobados: 2, rechazados: 1, conProblemas: 0, omitidos: 0, eventos: { revisados: 0, aprobados: 0, rechazados: 0, conProblemas: 0, esperando: 0 } }, "toma solo lo pendiente y vencido (no el que espera su hora, ni la vista previa, ni lo ya aprobado)");
  ok(filaDe(futuro.id).estado === "firmado" && filaDe(futuro.id).intentos === 0 && filaDe(previa.id).estado === "firmado" && filaDe(yaAprobado.id).estado === "aprobado", "lo demás quedó intacto");
  // dos corridas a la vez: cada documento sale UNA sola vez
  limpiarLlamadas();
  BF.tablas.documentoElectronico = [];
  const lote = [doc(), doc(), doc(), doc()];
  for (const x of lote) cola.recibe.push(responde(protocolo({ cdc: x.cdc, estado: "Aprobado", prot: "66", rs: [["0260", "ok"]] })));
  const [a, b] = await Promise.all([envio.procesarPendientes({ transporte, ahora: ahora0 }), envio.procesarPendientes({ transporte, ahora: ahora0 })]);
  ok(llamadas.filter((l) => l.servicio === "recibe").length === 4 && a.aprobados + b.aprobados === 4, "dos corridas a la vez (la tarea se pisa consigo misma): cada documento se envía una sola vez (" + (a.aprobados + b.aprobados) + " aprobados, " + llamadas.length + " llamadas)");
  limpiarLlamadas();
  const dLim = [doc(), doc(), doc()]; for (const x of dLim) cola.recibe.push(sinRed());
  const rl = await envio.procesarPendientes({ transporte, ahora: ahora0, limite: 2 });
  ok(rl.revisados === 2 && rl.conProblemas === 2, "el límite de cada corrida se respeta (los demás quedan para la próxima) y los problemas de comunicación se cuentan");

  window.log("\naciertos: " + window.__aciertos + " · fallas: " + window.__fallas);
  window.__listo = true;
})().catch((e) => { document.getElementById("salida").textContent += "\nERROR: " + (e && e.stack || e); window.__listo = true; window.__fallas = (window.__fallas || 0) + 1; });
