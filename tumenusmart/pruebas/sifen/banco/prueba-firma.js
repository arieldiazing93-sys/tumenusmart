// Pruebas de la firma digital y de los certificados. Se genera un certificado de PRUEBA (autofirmado, con el RUC en el titular y los usos de uno real),
// se firma con el código del sistema y la firma se verifica con tres jueces: la verificación propia, libxml2 (que el documento firmado siga cumpliendo el
// esquema oficial) y xmldsigjs, otra implementación completa de XMLDSig con su propio canonizador, que no conoce nuestro código.
(async () => {
  const { ok, igual } = window;
  const C = window.Cargador;
  const S = C.simulacros;
  S["node-forge"] = window.forge; // el cargador lo entrega como "default" de un módulo CommonJS
  const forge = window.forge;
  const armar = await C.cargar("src/lib/sifen/armar-de");
  const xml = await C.cargar("src/lib/sifen/xml");
  const firma = await C.cargar("src/lib/sifen/firma");
  const cert = await C.cargar("src/lib/sifen/certificado");
  const cod = await C.cargar("src/lib/sifen-codigos");

  // ------------------------------------------------------------------ jueces independientes
  const { validateXML } = await import("/xmllint/index-browser.mjs");
  const leer = async (n) => (await fetch("/xsd-test/" + n)).text();
  const reescribir = (t) => t.replace(/schemaLocation\s*=\s*"https:\/\/ekuatia\.set\.gov\.py\/sifen\/xsd\/([^"]+)"/g, 'schemaLocation="$1"');
  const nombres = ["DE_v150.xsd", "DE_Types_v150.xsd", "Paises_v100.xsd", "Departamentos_v141.xsd", "Monedas_v150.xsd", "Unidades_Medida_v141.xsd", "xmldsig-core-schema.xsd"];
  const preload = []; for (const n of nombres) preload.push({ fileName: n, contents: reescribir(await leer(n)) });
  const schema = [{ fileName: "siRecepDE_v150.xsd", contents: reescribir(await leer("siRecepDE_v150.xsd")) }];
  const xsd = async (texto) => validateXML({ xml: [{ fileName: "doc.xml", contents: texto }], schema, preload });
  const X = await import("https://esm.sh/xmldsigjs@2.5.0");
  const verificarConOtro = async (texto) => {
    const doc = X.Parse(texto);
    const firmas = doc.getElementsByTagNameNS("http://www.w3.org/2000/09/xmldsig#", "Signature");
    if (firmas.length !== 1) return "sin firma";
    const sx = new X.SignedXml(doc);
    sx.LoadXml(firmas[0]);
    try { return await sx.Verify(); } catch (e) { return "error: " + (e && e.message || e); }
  };

  // ------------------------------------------------------------------ un certificado de prueba y su .p12
  window.log("== Certificado de prueba (autofirmado, RSA 2048, con el RUC en el titular)");
  const fechas = (desde, hasta) => ({ desde: new Date(Date.now() + desde * 864e5), hasta: new Date(Date.now() + hasta * 864e5) });
  function crear({ bits = 2048, ruc = "RUC80012345-0", dias = [-1, 365], firmaDigital = true, clientAuth = true } = {}) {
    const claves = forge.pki.rsa.generateKeyPair({ bits, e: 0x10001 });
    const c = forge.pki.createCertificate();
    c.publicKey = claves.publicKey; c.serialNumber = "01";
    const f = fechas(dias[0], dias[1]); c.validity.notBefore = f.desde; c.validity.notAfter = f.hasta;
    const attrs = [{ name: "commonName", value: "GASTRONOMIA FABRI S.A." }, { name: "countryName", value: "PY" }];
    if (ruc) attrs.push({ name: "serialNumber", value: ruc });
    c.setSubject(attrs); c.setIssuer(attrs);
    const ext = []; if (firmaDigital) ext.push({ name: "keyUsage", digitalSignature: true, nonRepudiation: true });
    if (clientAuth) ext.push({ name: "extKeyUsage", clientAuth: true });
    if (ext.length) c.setExtensions(ext);
    c.sign(claves.privateKey, forge.md.sha256.create());
    return { claves, c };
  }
  const aP12 = (claves, c, clave) => forge.util.encode64(forge.asn1.toDer(forge.pkcs12.toPkcs12Asn1(claves.privateKey, [c], clave, { algorithm: "3des" })).getBytes());
  const t0 = Date.now();
  const bueno = crear();
  window.log("   (clave RSA de 2048 bits generada en " + Math.round((Date.now() - t0) / 100) / 10 + " s)");
  const p12 = aP12(bueno.claves, bueno.c, "secreto-123");
  const leido = cert.leerCertificadoP12(p12, "secreto-123");
  ok(leido.ok, "se abre un .p12 con su contraseña");
  const L = leido.certificado;
  igual([L.ruc, L.dv, L.bitsClave, L.usoFirmaDigital, L.usoAutenticacionCliente, L.avisos], ["80012345", "0", 2048, true, true, []], "RUC 80012345-0, 2048 bits, firma digital y autenticación de cliente, sin avisos");
  ok(/^[0-9a-f]{64}$/.test(L.huellaSha256) && L.sujeto.includes("GASTRONOMIA FABRI S.A.") && L.sujeto.includes("RUC80012345-0") && L.clavePrivadaPem.startsWith("-----BEGIN PRIVATE KEY-----") && L.certificadoPem.startsWith("-----BEGIN CERTIFICATE-----"), "huella SHA-256, titular, clave en PKCS#8 y certificado en PEM");
  const derHoja = firma.deBase64(L.certificadoBase64);
  const spkiForge = forge.asn1.toDer(forge.pki.publicKeyToAsn1(bueno.claves.publicKey)).getBytes();
  const spkiNuestra = String.fromCharCode(...firma.clavePublicaDeCertificado(derHoja));
  ok(spkiForge === spkiNuestra, "nuestro lector de certificados saca la misma clave pública que forge (el ASN.1 se lee bien)");
  const malaClave = cert.leerCertificadoP12(p12, "otra");
  ok(!malaClave.ok && malaClave.error.includes("contraseña") && !malaClave.error.includes("Error"), "contraseña equivocada: mensaje claro, sin detalle técnico");
  ok(!cert.leerCertificadoP12(btoa("esto no es un certificado"), "x").ok, "un archivo que no es un certificado se rechaza");
  const chico = crear({ bits: 1024 });
  const rChico = cert.leerCertificadoP12(aP12(chico.claves, chico.c, "x"), "x");
  ok(!rChico.ok && rChico.error.includes("1024"), "una clave de 1024 bits se rechaza (la DNIT pide 2048 o más)");
  const venc = crear({ bits: 2048, dias: [-400, -1], ruc: "RUC4987017-3" });
  const rVenc = cert.leerCertificadoP12(aP12(venc.claves, venc.c, "x"), "x");
  ok(rVenc.ok && rVenc.certificado.avisos.some((a) => a.includes("vencido")) && rVenc.certificado.ruc === "4987017", "un certificado vencido se abre pero avisa; RUC de 7 dígitos (persona física)");
  const sinNada = crear({ bits: 2048, ruc: null, firmaDigital: false, clientAuth: false });
  const rSin = cert.leerCertificadoP12(aP12(sinNada.claves, sinNada.c, "x"), "x");
  ok(rSin.ok && rSin.certificado.avisos.some((a) => a.includes("RUC")) && rSin.certificado.ruc === null, "sin RUC en el certificado: avisa");

  window.log("== Certificados reales creados con OpenSSL (los dos formatos de .p12 que se ven en la práctica)");
  const MUESTRAS = window.MUESTRAS_P12;
  const muestras = [["moderno (AES-256 + HMAC-SHA256, el de OpenSSL 3)", MUESTRAS.moderno], ["clásico (3DES + SHA-1, el de Windows o un OpenSSL viejo)", MUESTRAS.clasico]];
  for (const [nombre, b64] of muestras) {
    const r = cert.leerCertificadoP12(b64, MUESTRAS.clave);
    const k = r.ok ? r.certificado : null;
    ok(Boolean(k) && k.ruc === "80012345" && k.dv === "0" && k.bitsClave === 2048 && k.usoFirmaDigital && k.usoAutenticacionCliente === true && k.avisos.length === 0, nombre + ": se abre, RUC 80012345-0, 2048 bits y los usos correctos" + (r.ok ? "" : " -> " + r.error));
    const mala = cert.leerCertificadoP12(b64, "otra-clave");
    ok(!mala.ok && mala.error.includes("contraseña"), nombre + ": con otra contraseña no se abre y el mensaje no da detalles técnicos");
  }

  window.log("== Bóveda: la clave privada se guarda cifrada y atada a su negocio");
  const maestra = forge.util.encode64(forge.random.getBytesSync(32));
  const secreto = L.clavePrivadaPem;
  const c1 = await cert.cifrarSecreto(secreto, maestra, "negocio-1");
  const c2 = await cert.cifrarSecreto(secreto, maestra, "negocio-1");
  ok(/^v1\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+$/.test(c1) && !c1.includes("PRIVATE") && c1 !== c2, "queda como v1.<iv>.<cifrado>, sin nada legible, y cada vez distinto");
  igual(await cert.descifrarSecreto(c1, maestra, "negocio-1"), secreto, "se descifra con la clave maestra y su negocio");
  const falla = async (fn) => { try { await fn(); return false; } catch { return true; } };
  ok(await falla(() => cert.descifrarSecreto(c1, maestra, "negocio-2")), "copiado a otro negocio NO se descifra");
  ok(await falla(() => cert.descifrarSecreto(c1, forge.util.encode64(forge.random.getBytesSync(32)), "negocio-1")), "con otra clave maestra no se descifra");
  ok(await falla(() => cert.descifrarSecreto(c1.slice(0, -6) + (c1.endsWith("A==") ? "B==" : "A=="), maestra, "negocio-1")), "un texto cifrado alterado no se descifra");
  ok(await falla(() => cert.cifrarSecreto("x", forge.util.encode64("corta"), "n")), "una clave maestra que no es de 32 bytes se rechaza");

  // ------------------------------------------------------------------ el documento a firmar
  window.log("== Firma digital del documento (XMLDSig, RSA-SHA256)");
  const dv = (n) => cod.calcularDvRuc(String(n));
  const emisorDatos = { tipoContribuyente: "persona_juridica", tipoRegimen: null, nombreFantasia: "Lo de Fabri", denominacionSucursal: "Casa central", telefono: "0981123456", email: "fabri@correo.com.py", direccion: "Av. Mariscal López", numeroCasa: "1234", complemento: null, departamento: "capital", distritoCodigo: 1, distrito: null, ciudadCodigo: 1, ciudad: null, actividades: [{ codigo: "56101", descripcion: "Restaurantes y parrillas" }] };
  const item = (codigo, descripcion, precio, cantidad, iva, descuento = 0) => ({ codigo, descripcion, unidadMedida: "unidad", cantidad, precioUnitario: precio, descuento, total: precio * cantidad - descuento, iva });
  const comprobante = (items, extra = {}) => ({ tipo: "factura", modalidad: "electronico", tipoEmision: "normal", timbrado: "80012345", timbradoDesde: new Date("2026-01-01T03:00:00Z"), establecimiento: "001", punto: "001", correlativo: 47, numero: "001-001-0000047", fechaEmision: new Date("2026-10-09T17:30:05Z"), tipoTransaccion: "venta_mercaderia", moneda: "PYG", emisorRuc: "80012345-" + dv("80012345"), emisorRazonSocial: "Gastronomía Fabri S.A.", emisorDatos, receptorTipoIdentificacion: "ruc", receptorNumeroIdentificacion: "80069563-" + dv("80069563"), receptorRazonSocial: "Cliente de Prueba S.A.", receptorEmail: "cliente@correo.com", presencia: "presencial", condicion: "contado", fechaVencimientoCredito: null, items, total: items.reduce((s, i) => s + i.total, 0), ...extra });
  const OPC = { ambiente: "pruebas", fechaFirma: new Date("2026-10-09T17:31:00Z"), codigoSeguridad: "587326098" };
  const material = { clavePrivadaPkcs8: firma.pemADer(L.clavePrivadaPem), certificadoBase64: L.certificadoBase64 };
  const QR = { csc: "ABCD0000000000000000000000000000", idCsc: "0001", produccion: false };
  const itemsA = [item("p1", "Pizza muzzarella", 55000, 2, "gravado10", 11000), item("p2", "Gaseosa 2 L", 8000, 3, "gravado10", 2400), item("p3", "Pan casero", 12000, 1, "gravado5", 1200)];
  const A = armar.armarDE(comprobante(itemsA), [{ forma: "efectivo", monto: itemsA.reduce((s, i) => s + i.total, 0) }], OPC);
  igual(A.faltantes, [], "el documento de ejemplo no tiene faltantes");
  const F = await firma.firmarDocumento(A.de, material, QR);
  ok(F.xml.startsWith('<?xml version="1.0" encoding="UTF-8"?><rDE xmlns="http://ekuatia.set.gov.py/sifen/xsd"'), "el archivo es un <rDE> con su declaración XML");
  const pos = ["<dVerFor>", "<DE Id=", '<Signature xmlns="http://www.w3.org/2000/09/xmldsig#">', "<gCamFuFD>"].map((s) => F.xml.indexOf(s));
  ok(pos.every((p, i) => p > -1 && (i === 0 || p > pos[i - 1])), "orden: dVerFor, DE, Signature, gCamFuFD");
  ok(!/>\s+</.test(F.xml), "sin espacios ni saltos de línea entre etiquetas");
  ok(F.xml.includes(`<Reference URI="#${F.cdc}">`) && F.xml.includes('<Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature">') && (F.xml.match(/<Transform /g) || []).length === 1, "la referencia apunta al CDC y hay UNA sola transformación (enveloped), como pide la NT 16");
  ok(F.xml.includes('<SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256">') && F.xml.includes('<DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256">'), "firma RSA-SHA256 y resumen SHA-256");
  ok(!/KeyValue|X509SubjectName|X509IssuerSerial|X509IssuerName|X509SKI|RSAKeyValue/.test(F.xml) && F.xml.includes("<X509Certificate>" + L.certificadoBase64 + "</X509Certificate>"), "solo el certificado en KeyInfo: ni KeyValue ni nombres ni SKI (Manual 7.6)");
  ok(F.digestValue.length === 44 && F.signatureValue.length === 344, "resumen de 44 caracteres y firma de 344 (RSA 2048 en base64)");
  const hexDigest = Array.from(new TextEncoder().encode(F.digestValue), (b) => b.toString(16).padStart(2, "0")).join("");
  ok(F.xml.includes("&amp;DigestValue=" + hexDigest + "&amp;IdCSC=0001&amp;cHashQR=") && F.urlQr.includes("DigestValue=" + hexDigest), "el QR lleva el DigestValue (en hexadecimal) y está FUERA de lo firmado");
  const leidoXml = xml.leerXmlRDE(F.xml);
  ok(xml.aXmlRDE(leidoXml) === F.xml, "leer el archivo firmado y volver a escribirlo da exactamente el mismo archivo (el lector de XML es fiel)");
  ok(leidoXml.DE["@Id"] === F.cdc && leidoXml.gCamFuFD.dCarQR === F.urlQr && String(leidoXml.Signature).startsWith("<Signature") && leidoXml.DE.gDtipDE.gCamItem.length === 3 && leidoXml.DE.gTotSub.dTotGralOpe === String(A.de.gTotSub.dTotGralOpe), "y trae el CDC, el QR (sin el escape &amp;), la firma como texto, los 3 ítems y los totales");
  let errLectura = 0; for (const roto of ["", "hola", "<rDE><DE></rDE>", "<a></b>", F.xml.replace("</rDE>", ""), F.xml + "basura"]) { try { xml.leerXmlRDE(roto); } catch { errLectura++; } }
  igual(errLectura, 6, "un archivo vacío, sin etiquetas, mal cerrado o con basura al final no se lee");
  const F2 = await firma.firmarDocumento(A.de, material, QR);
  ok(F2.xml === F.xml, "firmar dos veces el mismo documento da el mismo archivo (RSA PKCS#1 v1.5 es determinista)");

  window.log("== Los tres jueces");
  const propia = await firma.verificarFirmaXml(F.xml);
  ok(propia.valida && propia.cdc === F.cdc, "verificación propia: firma válida");
  const rXsd = await xsd(F.xml);
  ok(rXsd.valid, "libxml2: el documento FIRMADO sigue cumpliendo el esquema oficial" + (rXsd.valid ? "" : " -> " + JSON.stringify(rXsd.errors.map((e) => e.message).slice(0, 3))));
  const otro = await verificarConOtro(F.xml);
  ok(otro === true, "xmldsigjs (otra implementación de XMLDSig, con su propio canonizador): firma VÁLIDA" + (otro === true ? "" : " -> " + otro));

  for (const [nombre, b64] of muestras) {
    const k = cert.leerCertificadoP12(b64, MUESTRAS.clave).certificado;
    const FO = await firma.firmarDocumento(A.de, { clavePrivadaPkcs8: firma.pemADer(k.clavePrivadaPem), certificadoBase64: k.certificadoBase64 }, QR);
    const vo = await firma.verificarFirmaXml(FO.xml); const oo = await verificarConOtro(FO.xml);
    ok(vo.valida && oo === true, "firmado con el certificado " + nombre + ": la verificación propia (" + vo.valida + ") y xmldsigjs (" + oo + ") lo aceptan");
  }

  window.log("== Si alguien toca el documento, la firma lo delata");
  const alterados = {
    "un monto del DE": F.xml.replace(/<dTotGralOpe>\d+<\/dTotGralOpe>/, "<dTotGralOpe>1</dTotGralOpe>"),
    "el nombre del comprador": F.xml.replace("Cliente de Prueba S.A.", "Cliente de Prueba S.A. "),
    "la firma": F.xml.replace(/<SignatureValue>(.)/, (m, c) => "<SignatureValue>" + (c === "A" ? "B" : "A")),
    "el resumen": F.xml.replace(/<DigestValue>(.)/, (m, c) => "<DigestValue>" + (c === "A" ? "B" : "A")),
    "SignedInfo (otra referencia)": F.xml.replace(`<Reference URI="#${F.cdc}">`, `<Reference URI="#${"0".repeat(44)}">`),
  };
  for (const [que, texto] of Object.entries(alterados)) {
    const v = await firma.verificarFirmaXml(texto); const o = await verificarConOtro(texto);
    ok(texto !== F.xml && v.valida === false && o !== true, "alterar " + que + ": la verificación propia (" + (v.valida ? "pasó" : "rechaza") + ") y xmldsigjs (" + o + ") lo rechazan");
  }
  const sinCert = F.xml.replace(/<X509Certificate>[^<]+<\/X509Certificate>/, "<X509Certificate></X509Certificate>");
  ok((await firma.verificarFirmaXml(sinCert)).valida === false, "sin certificado no hay verificación");
  const otraFirma = crear({ bits: 2048 });
  const materialAjeno = { clavePrivadaPkcs8: firma.pemADer(forge.pki.privateKeyInfoToPem(forge.pki.wrapRsaPrivateKey(forge.pki.privateKeyToAsn1(otraFirma.claves.privateKey)))), certificadoBase64: L.certificadoBase64 };
  const ajeno = await firma.firmarDocumento(A.de, materialAjeno, QR);
  ok((await firma.verificarFirmaXml(ajeno.xml)).valida === false && (await verificarConOtro(ajeno.xml)) !== true, "firmado con una clave que NO es la del certificado: los dos jueces lo rechazan");

  window.log("== Canonización inclusiva de SignedInfo y textos difíciles");
  const FI = await firma.firmarDocumento(A.de, material, QR, { canonizacionSignedInfo: "inclusiva" });
  ok(FI.xml.includes('Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"') && FI.signatureValue !== F.signatureValue, "con la variante inclusiva el documento declara otro método y la firma cambia");
  ok((await firma.verificarFirmaXml(FI.xml)).valida === true && (await verificarConOtro(FI.xml)) === true, "y también la verifican los dos jueces (xmldsigjs canoniza por su cuenta con el xmlns:xsi que hereda)");
  const raros = ["Pizza \"Ñandú\" & <queso> 100% ½ kg", "Línea 1\r\nLínea 2\rLínea 3", "Emoji 🍕 y 😀", "Control \u0001\u0008 raro", "Tab\tadentro", "Mucho   espacio  "];
  for (const [i, d] of raros.entries()) {
    const R = armar.armarDE(comprobante([item("x", d, 20000, 1, "gravado10")]), [{ forma: "efectivo", monto: 20000 }], { ...OPC, ambiente: "produccion" });
    if (R.faltantes.length) { ok(false, "texto " + i + ": faltantes " + R.faltantes[0]); continue; }
    const FR = await firma.firmarDocumento(R.de, material, QR);
    const v = await firma.verificarFirmaXml(FR.xml); const o = await verificarConOtro(FR.xml); const x = await xsd(FR.xml);
    ok(v.valida && o === true && x.valid, "texto difícil " + (i + 1) + " (" + JSON.stringify(d).slice(0, 40) + "): propia " + v.valida + ", xmldsigjs " + o + ", esquema " + x.valid);
  }
  const conSalto = armar.armarDE(comprobante([item("x", " Línea 1\r\nLínea 2\t\tLínea 3 ", 20000, 1, "gravado10")]), [{ forma: "efectivo", monto: 20000 }], { ...OPC, ambiente: "produccion" });
  igual(conSalto.de.gDtipDE.gCamItem[0].dDesProSer, "Línea 1 Línea 2 Línea 3", "un nombre con saltos de línea y tabulaciones sale en una sola línea (el esquema no admite saltos)");
  igual([xml.limpiarTextoXml("a\r\nb\rc"), xml.limpiarTextoXml("x\u0000y\u000Bz"), xml.limpiarTextoXml("🍕"), xml.limpiarTextoXml("\uD83D")], ["a\nb\nc", "xyz", "🍕", ""], "limpiarTextoXml: CR a salto de línea, sin controles, emoji completo sí y mitad suelta no");

  window.log("== No se firma lo que la DNIT rechazaría");
  const roto = JSON.parse(JSON.stringify(A.de)); delete roto.gTimb.dNumTim;
  let msg = ""; try { await firma.firmarDocumento(roto, material, QR); } catch (e) { msg = e.message; }
  ok(msg.includes("esquema") && msg.includes("dNumTim"), "un documento que no cumple el esquema no se firma: " + msg.slice(0, 80));
  const cuentasMal = JSON.parse(JSON.stringify(A.de)); cuentasMal.gTotSub.dTotIVA = 1;
  msg = ""; try { await firma.firmarDocumento(cuentasMal, material, QR); } catch (e) { msg = e.message; }
  ok(msg.includes("cuentas"), "uno con cuentas que no cierran tampoco: " + msg.slice(0, 80));
  msg = ""; try { await firma.firmarDocumento({ ...A.de, "@Id": "123" }, material, QR); } catch (e) { msg = e.message; }
  ok(msg.includes("CDC"), "ni uno sin CDC válido");
  msg = ""; try { await firma.firmarDocumento(A.de, material, { ...QR, csc: "" }); } catch (e) { msg = e.message; }
  ok(msg.includes("CSC"), "ni sin el código de seguridad del contribuyente para el QR");

  window.log("== El comprobante impreso (KuDE) se arma leyendo el archivo firmado");
  const kude = await C.cargar("src/lib/sifen/kude");
  const M = kude.construirKude(F.xml);
  const miles = (n) => new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 }).format(Math.round(n));
  igual([M.titulo, M.numero, M.timbrado, M.inicioVigencia], ["KuDE de Factura Electrónica", "001-001-0000047", "80012345", "01-01-2026"], "título, número, timbrado y inicio de vigencia en DD-MM-AAAA (NT 10)");
  igual([M.emisor.ruc, M.emisor.razonSocial, M.emisor.nombreFantasia, M.emisor.actividad], ["80012345-0", armar.NOMBRE_EMISOR_PRUEBAS, "Lo de Fabri", "Restaurantes y parrillas"], "emisor: RUC con su dígito, razón social (en pruebas, el texto oficial de la guía), fantasía y actividad");
  ok(M.fechaEmision === A.de.gDatGralOpe.dFeEmiDE && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(M.fechaEmision), "la fecha de emisión con guiones: AAAA-MM-DDThh:mm:ss");
  igual([M.condicion, M.moneda, M.tipoOperacion, M.receptor.tipoDocumento, M.receptor.nombre], ["Contado", "Guarani", "Venta de mercadería", "RUC", "Cliente de Prueba S.A."], "condición, moneda, tipo de operación y receptor");
  ok(M.receptor.documento === "80069563-" + dv("80069563"), "el documento del receptor lleva RUC y dígito");
  igual(M.items.map((i) => [i.codigo, i.cantidad, i.precioUnitario, i.descuento, i.exentas, i.iva5, i.iva10]), [
    ["p1", "2", "55.000", "11.000", "0", "0", "99.000"],
    ["p2", "3", "8.000", "2.400", "0", "0", "21.600"],
    ["p3", "1", "12.000", "1.200", "0", "10.800", "0"],
  ], "cada línea: cantidad, precio, descuento y el valor de venta en la columna de su IVA");
  const tot = A.de.gTotSub;
  igual([M.totales.subExentas, M.totales.sub5, M.totales.sub10, M.totales.totalOperacion, M.totales.totalGuaranies], ["0", miles(tot.dSub5), miles(tot.dSub10), miles(tot.dTotOpe), miles(tot.dTotGralOpe)], "subtotales y total tal cual el documento");
  igual([M.totales.liquidacion5, M.totales.liquidacion10, M.totales.totalIva], [miles(tot.dLiqTotIVA5), miles(tot.dLiqTotIVA10), miles(tot.dTotIVA)], "liquidación del IVA y total del IVA");
  ok(/^(\d{4} ){10}\d{4}$/.test(M.cdcAgrupado) && M.cdcAgrupado.replace(/ /g, "") === F.cdc, "el CDC en once grupos de cuatro (13.4.4)");
  ok(M.urlQr === F.urlQr && M.esPrueba && M.urlConsulta === "https://ekuatia.set.gov.py/consultas-test/", "el QR es el del documento y, firmado en pruebas, apunta a la consulta de pruebas");
  const Mp = kude.construirKude((await firma.firmarDocumento(armar.armarDE(comprobante([item("x", "Café", 10000, 1, "gravado10")]), [{ forma: "efectivo", monto: 10000 }], { ...OPC, ambiente: "produccion" }).de, material, { ...QR, produccion: true })).xml);
  ok(!Mp.esPrueba && Mp.urlConsulta === "https://ekuatia.set.gov.py/consultas/", "firmado en producción: sin marca de pruebas y con la consulta de producción");
  const cred = kude.construirKude((await firma.firmarDocumento(armar.armarDE(comprobante([item("x", "Café", 10000, 1, "gravado10")], { condicion: "credito", fechaVencimientoCredito: new Date("2026-11-08T03:00:00Z") }), [], OPC).de, material, QR)).xml);
  ok(cred.condicion === "Crédito" && /\d+ días/.test(cred.plazo || "") && cred.pagos.length === 0, "a crédito: muestra el plazo y no hay forma de pago");
  const unaPaga = kude.construirKude(F.xml);
  igual(unaPaga.pagos.map((p) => p.forma), ["Efectivo"], "al contado: la forma de pago del documento");
  let errKude = 0; for (const roto of ["", "<rDE></rDE>", F.xml.replace(/<gTotSub>[\s\S]*<\/gTotSub>/, "")]) { try { kude.construirKude(roto); } catch { errKude++; } }
  igual(errKude, 3, "un archivo vacío, sin documento o sin totales no arma un KuDE");

  window.log("\naciertos: " + window.__aciertos + " · fallas: " + window.__fallas);
  window.__listo = true;
})().catch((e) => { document.getElementById("salida").textContent += "\nERROR: " + (e && e.stack || e); window.__listo = true; window.__fallas = (window.__fallas || 0) + 1; });
