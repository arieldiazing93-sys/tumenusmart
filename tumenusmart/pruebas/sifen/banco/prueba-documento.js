// Pruebas del documento electrónico completo (SIFEN): se arma la factura, se escribe el XML y se controla contra el esquema OFICIAL de la DNIT
// con dos validadores distintos: el nuestro (guiado por el mismo esquema) y libxml2 (xmllint compilado a WebAssembly) como árbitro independiente.
(async () => {
  const { ok, igual } = window;
  const C = window.Cargador;
  const armar = await C.cargar("src/lib/sifen/armar-de");
  const xml = await C.cargar("src/lib/sifen/xml");
  const cdc = await C.cargar("src/lib/sifen/cdc");
  const qr = await C.cargar("src/lib/sifen/qr");
  const ctl = await C.cargar("src/lib/sifen/controlar");
  const E = await C.cargar("src/lib/sifen/esquema-de.generated");
  const emi = await C.cargar("src/lib/emisor-fiscal");
  const cod = await C.cargar("src/lib/sifen-codigos");

  // ------------------------------------------------------------------ el validador independiente (libxml2)
  const { validateXML } = await import("/xmllint/index-browser.mjs");
  const leer = async (n) => (await fetch("/xsd-test/" + n)).text();
  const reescribir = (t) => t.replace(/schemaLocation\s*=\s*"https:\/\/ekuatia\.set\.gov\.py\/sifen\/xsd\/([^"]+)"/g, 'schemaLocation="$1"');
  const nombres = ["DE_v150.xsd", "DE_Types_v150.xsd", "Paises_v100.xsd", "Departamentos_v141.xsd", "Monedas_v150.xsd", "Unidades_Medida_v141.xsd", "xmldsig-core-schema.xsd"];
  const preload = [];
  for (const n of nombres) preload.push({ fileName: n, contents: reescribir(await leer(n)) });
  const schema = [{ fileName: "siRecepDE_v150.xsd", contents: reescribir(await leer("siRecepDE_v150.xsd")) }];
  const xsd = async (texto) => validateXML({ xml: [{ fileName: "doc.xml", contents: texto }], schema, preload });

  // ------------------------------------------------------------------ datos de ejemplo
  const dv = (n) => cod.calcularDvRuc(String(n));
  const RUC = "80012345";
  const emisorDatos = { tipoContribuyente: "persona_juridica", tipoRegimen: null, nombreFantasia: "Lo de Fabri", denominacionSucursal: "Casa central", telefono: "0981123456", email: "fabri@correo.com.py", direccion: "Av. Mariscal López", numeroCasa: "1234", complemento: null, departamento: "central", distritoCodigo: 1, distrito: "ASUNCION", ciudadCodigo: 1, ciudad: "ASUNCION (DISTRITO)", actividades: [{ codigo: "56101", descripcion: "Restaurantes y parrillas" }] };
  const item = (codigo, descripcion, precio, cantidad, iva, descuento = 0, unidadMedida = "unidad") => ({ codigo, descripcion, unidadMedida, cantidad, precioUnitario: precio, descuento, total: precio * cantidad - descuento, iva });
  const comprobante = (items, extra = {}) => ({
    tipo: "factura", modalidad: "electronico", tipoEmision: "normal", timbrado: "12345678", timbradoDesde: new Date("2026-01-01T03:00:00Z"),
    establecimiento: "001", punto: "001", correlativo: 47, numero: "001-001-0000047", fechaEmision: new Date("2026-10-09T17:30:05Z"),
    tipoTransaccion: "venta_mercaderia", moneda: "PYG", emisorRuc: RUC + "-" + dv(RUC), emisorRazonSocial: "Gastronomía Fabri S.A.", emisorDatos,
    receptorTipoIdentificacion: "ruc", receptorNumeroIdentificacion: "80069563-" + dv("80069563"), receptorRazonSocial: "Cliente de Prueba S.A.", receptorEmail: "cliente@correo.com",
    presencia: "presencial", condicion: "contado", fechaVencimientoCredito: null, items, total: items.reduce((s, i) => s + i.total, 0), ...extra,
  });
  const OPC = { ambiente: "pruebas", fechaFirma: new Date("2026-10-09T17:31:00Z"), codigoSeguridad: "587326098" };

  const DIGEST = "Nt2UmpjUHuu2DT6CJc2mtKhhqbq94LHSak1IsEOtuWk=";
  const firmaFalsa = (id) => `<Signature xmlns="http://www.w3.org/2000/09/xmldsig#"><SignedInfo><CanonicalizationMethod Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"/><SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/><Reference URI="#${id}"><Transforms><Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/></Transforms><DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/><DigestValue>${DIGEST}</DigestValue></Reference></SignedInfo><SignatureValue>${"A".repeat(344)}</SignatureValue><KeyInfo><X509Data><X509Certificate>MIIB${"A".repeat(1500)}</X509Certificate></X509Data></KeyInfo></Signature>`;
  const completo = async (c, pagos, opc = OPC) => {
    const r = armar.armarDE(c, pagos, opc);
    if (!r.de) return { r, rde: null, texto: null };
    const g = r.de.gDatGralOpe.gEmis; const rec = r.de.gDatGralOpe.gDatRec; const tot = r.de.gTotSub;
    const q = await qr.construirQr({ cdc: r.cdc, fechaEmision: r.de.gDatGralOpe.dFeEmiDE, idReceptor: String(rec.dRucRec ?? rec.dNumIDRec ?? "0"), receptorConRuc: rec.dRucRec !== undefined, totalGeneral: tot.dTotGralOpe, totalIva: tot.dTotIVA, cantidadItems: r.de.gDtipDE.gCamItem.length, digestValue: DIGEST, idCsc: "0001", csc: "ABCD0000000000000000000000000000", produccion: false });
    const rde = armar.armarRDE(r.de, firmaFalsa(r.cdc), q.url);
    return { r, rde, texto: xml.aXmlRDE(rde), q };
  };
  const PAGOS_MIXTO = (total) => [{ forma: "efectivo", monto: total - 37700 }, { forma: "tarjeta_debito", monto: 37700 }];

  // =================================================================================== A. una factura completa, a mano
  window.log("== Factura completa B2B con 3 tasas, descuento del 10 % y pago dividido");
  const itemsA = [item("p1", "Pizza muzzarella", 55000, 2, "gravado10", 11000), item("p2", "Gaseosa 2 L", 8000, 3, "gravado10", 2400), item("p3", "Pan casero", 12000, 1, "gravado5", 1200), item("p4", "Verdura de estación", 7000, 1, "exento", 700)];
  const A = await completo(comprobante(itemsA), PAGOS_MIXTO(137700));
  igual(A.r.faltantes, [], "sin faltantes");
  ok(A.r.cdc && cdc.cdcValido(A.r.cdc) && A.r.cdc.slice(0, 2) === "01" && A.r.cdc.includes("587326098") && A.r.cdc.startsWith("0180012345" + dv(RUC)), "CDC válido que empieza con 01 + RUC del emisor + su DV");
  igual(A.r.cdc.slice(17, 24) + "|" + A.r.cdc.slice(24, 25) + "|" + A.r.cdc.slice(25, 33), "0000047|2|20261009", "CDC: número 0000047, persona jurídica, fecha de emisión 2026-10-09 (hora de Asunción)");
  const de = A.r.de; const t = de.gTotSub;
  igual(de.dDVId, A.r.cdc.slice(43), "dDVId es el último dígito del CDC");
  igual(de.dFecFirma, "2026-10-09T14:31:00", "la fecha de firma sale en hora de Asunción");
  igual(de.gDatGralOpe.dFeEmiDE, "2026-10-09T14:30:05", "la fecha de emisión sale en hora de Asunción");
  igual([t.dSub10, t.dSub5, t.dSubExe, t.dTotOpe, t.dTotGralOpe], [120600, 10800, 6300, 137700, 137700], "subtotales 10 % / 5 % / exento y total");
  igual([t.dLiqTotIVA10, t.dLiqTotIVA5, t.dTotIVA], [10964, 514, 11478], "IVA liquidado (10 %: 9.000 + 1.964; 5 %: 514)");
  igual([t.dBaseGrav10, t.dBaseGrav5, t.dTBasGraIVA], [109636, 10286, 119922], "bases gravadas");
  igual([t.dTotDescGlotem, t.dDescTotal, t.dPorcDescTotal, t.dTotDesc], [15300, 15300, 10, 0], "descuento global 15.300 = 10 %");
  const it0 = de.gDtipDE.gCamItem[0];
  igual([it0.gValorItem.gValorRestaItem.dDescGloItem, it0.gValorItem.gValorRestaItem.dTotOpeItem, it0.gValorItem.dTotBruOpeItem, it0.gCamIVA.dBasGravIVA, it0.gCamIVA.dLiqIVAItem], [5500, 99000, 110000, 90000, 9000], "ítem 1: descuento por unidad 5.500, total 99.000, base 90.000, IVA 9.000");
  const exento = de.gDtipDE.gCamItem[3].gCamIVA;
  igual([exento.iAfecIVA, exento.dDesAfecIVA, exento.dPropIVA, exento.dTasaIVA, exento.dBasGravIVA, exento.dLiqIVAItem, exento.dBasExe], [3, "Exento", 0, 0, 0, 0, 0], "el ítem exento lleva todo en cero");
  ok(de.gDtipDE.gCamCond.gPaConEIni.length === 2 && de.gDtipDE.gCamCond.gPaConEIni[1].gPagTarCD.iDenTarj === 99 && !de.gDtipDE.gCamCond.gPaConEIni[0].gPagTarCD, "dos pagos: la tarjeta lleva su grupo de tarjeta y el efectivo no");
  ok(A.r.avisos.some((a) => a.includes("tarjeta")) && A.r.avisos.some((a) => a.includes("tipo de contribuyente del comprador")), "avisa lo que todavía se estima (marca de tarjeta, tipo de contribuyente del comprador)");
  igual(ctl.controlarCalculos(de), [], "el autocontrol de cuentas da todo en orden");
  igual(xml.validarContraEsquema(A.rde), [], "nuestro validador: cumple el esquema oficial");
  const rA = await xsd(A.texto);
  ok(rA.valid, "libxml2 (validador independiente) con los XSD oficiales: VÁLIDO" + (rA.valid ? "" : " -> " + JSON.stringify(rA.errors.map((e) => e.message).slice(0, 4))));

  window.log("== El XML");
  ok(A.texto.startsWith('<?xml version="1.0" encoding="UTF-8"?><rDE xmlns="http://ekuatia.set.gov.py/sifen/xsd" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://ekuatia.set.gov.py/sifen/xsd siRecepDE_v150.xsd"><dVerFor>150</dVerFor><DE Id="' + A.r.cdc + '">'), "declaración, namespace sin prefijos, dVerFor 150 y <DE Id=CDC>");
  ok(!/>\s+</.test(A.texto), "sin espacios ni saltos de línea entre etiquetas (la firma depende de eso)");
  const pos = ["<dVerFor>", "<DE ", "<Signature ", "<gCamFuFD>"].map((s) => A.texto.indexOf(s));
  ok(pos.every((p, i) => p > -1 && (i === 0 || p > pos[i - 1])), "orden del esquema: dVerFor, DE, Signature, gCamFuFD");
  ok(A.texto.includes("<dCarQR>https://ekuatia.set.gov.py/consultas-test/qr?nVersion=150&amp;Id=" + A.r.cdc), "el QR va dentro de <dCarQR> con los & escapados");
  const doc = new DOMParser().parseFromString(A.texto, "application/xml");
  ok(!doc.querySelector("parsererror"), "el navegador lo lee como XML bien formado");
  igual(doc.querySelector("DE").getAttribute("Id"), A.r.cdc, "el atributo Id está en el elemento DE");
  const tags = [...doc.querySelectorAll("DE > *")].map((e) => e.localName);
  igual(tags, ["dDVId", "dFecFirma", "dSisFact", "gOpeDE", "gTimb", "gDatGralOpe", "gDtipDE", "gTotSub"], "los grupos del DE salen en el orden del esquema");

  window.log("== Caracteres especiales");
  const raros = await completo(comprobante([item("x", 'Pizza "Ñandú" & <queso> 100% ½ kg', 20000, 1, "gravado10")]), [{ forma: "efectivo", monto: 20000 }], { ...OPC, ambiente: "produccion" });
  igual(raros.r.faltantes, [], "una descripción con comillas, &, <, >, ñ y tildes no genera faltantes");
  ok(raros.texto.includes("Pizza \"Ñandú\" &amp; &lt;queso&gt; 100% ½ kg"), "queda escapada en el XML");
  igual(new DOMParser().parseFromString(raros.texto, "application/xml").querySelector("dDesProSer").textContent, 'Pizza "Ñandú" & <queso> 100% ½ kg', "y al leerlo vuelve igual");
  ok((await xsd(raros.texto)).valid, "libxml2: válido");

  // =================================================================================== B. receptor
  window.log("== Receptor: innominado, cédula, pasaporte");
  const sinNombre = (monto) => comprobante([item("p", "Almuerzo", monto, 1, "gravado10")], { receptorTipoIdentificacion: "sin_nombre", receptorNumeroIdentificacion: "", receptorRazonSocial: null, receptorEmail: null });
  const inn = await completo(sinNombre(6900000), [{ forma: "efectivo", monto: 6900000 }]);
  igual(inn.r.faltantes, [], "Sin Nombre por 6.900.000 Gs.: se puede");
  const rec = inn.r.de.gDatGralOpe.gDatRec;
  igual([rec.iNatRec, rec.iTiOpe, rec.iTipIDRec, rec.dDTipIDRec, rec.dNumIDRec, rec.dNomRec, rec.dRucRec], [2, 2, 5, "Innominado", "0", "Sin Nombre", undefined], "innominado: no contribuyente, B2C, tipo 5, número 0, nombre 'Sin Nombre'");
  ok((await xsd(inn.texto)).valid, "libxml2: válido");
  const inn2 = armar.armarDE(sinNombre(7000000), [{ forma: "efectivo", monto: 7000000 }], OPC);
  ok(inn2.faltantes.some((f) => f.includes("Sin Nombre") && f.includes("7.000.000")), "Sin Nombre desde 7.000.000 Gs.: no se puede (NT 24 / Decreto 872/2023)");
  const ced = await completo(comprobante([item("p", "Almuerzo", 30000, 1, "gravado10")], { receptorTipoIdentificacion: "cedula", receptorNumeroIdentificacion: "1.234.567", receptorRazonSocial: "Juan Pérez", receptorEmail: "no es un correo" }), [{ forma: "transferencia", monto: 30000 }]);
  igual(ced.r.faltantes, [], "cédula con puntos y correo mal escrito: sin faltantes");
  igual([ced.r.de.gDatGralOpe.gDatRec.dNumIDRec, ced.r.de.gDatGralOpe.gDatRec.dDTipIDRec, ced.r.de.gDatGralOpe.gDatRec.dEmailRec], ["1234567", "Cédula paraguaya", undefined], "se limpian los puntos de la cédula y se omite el correo inválido");
  ok(ced.r.avisos.some((a) => a.includes("correo del comprador")), "avisa que omitió el correo");
  ok((await xsd(ced.texto)).valid, "libxml2: válido");
  const pas = await completo(comprobante([item("p", "Almuerzo", 30000, 1, "gravado10")], { receptorTipoIdentificacion: "pasaporte", receptorNumeroIdentificacion: "AB-12345", receptorRazonSocial: "John Smith" }), [{ forma: "efectivo", monto: 30000 }]);
  igual(pas.r.faltantes, [], "pasaporte válido");
  ok((await xsd(pas.texto)).valid, "libxml2: válido");

  // =================================================================================== C. crédito y servicios
  window.log("== Crédito, servicios y otras condiciones");
  const cre = await completo(comprobante([item("s", "Corte de pelo", 50000, 1, "gravado10")], { condicion: "credito", fechaVencimientoCredito: new Date("2026-11-08T03:00:00Z"), tipoTransaccion: "prestacion_servicios" }), []);
  igual(cre.r.faltantes, [], "venta a crédito sin pagos: sin faltantes");
  igual([cre.r.de.gDtipDE.gCamCond.iCondOpe, cre.r.de.gDtipDE.gCamCond.dDCondOpe, cre.r.de.gDtipDE.gCamCond.gPagCred.dPlazoCre, cre.r.de.gDtipDE.gCamCond.gPaConEIni, cre.r.de.gDatGralOpe.gOpeCom.iTipTra, cre.r.de.gDatGralOpe.gOpeCom.dDesTipTra], [2, "Crédito", "30 días", undefined, 2, "Prestación de servicios"], "crédito a 30 días, sin grupo de pagos, servicio");
  ok((await xsd(cre.texto)).valid, "libxml2: válido");
  const kilo = await completo(comprobante([item("k", "Asado", 60000, 1.5, "gravado10", 0, "kilogramo"), item("l", "Cerveza", 15000, 2.5, "gravado10", 0, "litro")]), [{ forma: "efectivo", monto: 127500 }]);
  igual(kilo.r.faltantes, [], "cantidades con decimales y unidades kg y litro");
  igual([kilo.r.de.gDtipDE.gCamItem[0].cUniMed, kilo.r.de.gDtipDE.gCamItem[0].dDesUniMed, kilo.r.de.gDtipDE.gCamItem[1].cUniMed, kilo.r.de.gDtipDE.gCamItem[1].dDesUniMed], [83, "kg", 89, "LT"], "kg = 83 y litro = 89");
  ok((await xsd(kilo.texto)).valid, "libxml2: válido");
  const delivery = await completo(comprobante([item("p", "Pizza", 55000, 1, "gravado10"), item(null, "Envío (Zona 2)", 15000, 1, "gravado10"), item(null, "Pizza mitad muzzarella / mitad napolitana", 60000, 1, "gravado10")], { presencia: "domicilio" }), [{ forma: "efectivo", monto: 130000 }]);
  igual(delivery.r.faltantes, [], "delivery con envío y mitad y mitad (sin código de producto)");
  const codigos = delivery.r.de.gDtipDE.gCamItem.map((i) => i.dCodInt);
  ok(codigos[1] === "ENVIO" && new Set(codigos).size === 3 && codigos.every((c2) => c2.length >= 1 && c2.length <= 50), "las líneas sin código reciben uno propio y distinto (ENVIO, y uno estable para el combo): " + codigos.join(", "));
  igual(delivery.r.de.gDtipDE.gCamFE.dDesIndPres, "Venta a domicilio", "presencia: venta a domicilio");
  ok((await xsd(delivery.texto)).valid, "libxml2: válido");

  // =================================================================================== D. lo que falta o está mal
  window.log("== Datos que faltan o están mal: se avisa en vez de armar un documento que la DNIT rechaza");
  const base = () => comprobante([item("p", "Almuerzo", 30000, 1, "gravado10")]);
  const pg = [{ forma: "efectivo", monto: 30000 }];
  const sinDir = armar.armarDE(comprobante([item("p", "Almuerzo", 30000, 1, "gravado10")], { emisorDatos: { ...emisorDatos, direccion: null, telefono: null, actividades: [] } }), pg, OPC);
  ok(sinDir.faltantes.some((f) => f.includes("Dirección")) && sinDir.faltantes.some((f) => f.includes("Teléfono")) && sinDir.faltantes.some((f) => f.includes("actividad")), "emisor sin dirección, teléfono ni actividades: lo dice con nombres de pantalla");
  ok(!sinDir.faltantes.some((f) => f.includes("/gEmis/")), "y no repite lo mismo con rutas del esquema");
  const dvMalo = armar.armarDE(comprobante([item("p", "Almuerzo", 30000, 1, "gravado10")], { emisorRuc: RUC + "-" + ((dv(RUC) + 1) % 10) }), pg, OPC);
  ok(dvMalo.faltantes.some((f) => f.includes("dígito verificador del RUC del emisor")), "dígito verificador del RUC del emisor mal");
  ok(armar.armarDE({ ...base(), timbrado: "1234567" }, pg, OPC).faltantes.some((f) => f.includes("8 dígitos")), "timbrado de 7 dígitos");
  ok(armar.armarDE({ ...base(), timbradoDesde: null }, pg, OPC).faltantes.some((f) => f.includes("inicio de vigencia")), "sin fecha de inicio del timbrado");
  ok(armar.armarDE({ ...base(), timbradoDesde: new Date("2017-01-01T03:00:00Z") }, pg, OPC).faltantes.some((f) => f.includes("2018-05-01")), "timbrado anterior a mayo de 2018");
  ok(armar.armarDE({ ...base(), correlativo: 12345678 }, pg, OPC).cdc === null, "número de documento de 8 dígitos: ni siquiera arma el CDC");
  ok(armar.armarDE(comprobante([]), [], OPC).faltantes.some((f) => f.includes("ninguna línea")), "sin líneas");
  ok(armar.armarDE({ ...base(), total: 99999 }, pg, OPC).faltantes.some((f) => f.includes("no coincide con el total")), "la suma de las líneas no es el total del comprobante");
  ok(armar.armarDE(base(), [{ forma: "efectivo", monto: 29000 }], OPC).faltantes.some((f) => f.includes("Los pagos suman")), "los pagos no suman el total");
  ok(armar.armarDE(base(), [], OPC).faltantes.some((f) => f.includes("forma de pago")), "contado sin forma de pago");
  ok(armar.armarDE({ ...base(), receptorRazonSocial: "Ab" }, pg, OPC).faltantes.some((f) => f.includes("al menos 4")), "nombre del comprador de 2 letras");
  ok(armar.armarDE({ ...base(), receptorNumeroIdentificacion: "80069563-" + ((dv("80069563") + 1) % 10) }, pg, OPC).faltantes.some((f) => f.includes("RUC del comprador")), "dígito verificador del RUC del comprador mal");
  ok(armar.armarDE({ ...base(), tipo: "nota_credito" }, pg, OPC).faltantes.some((f) => f.includes("solo se arma la factura")), "una nota de crédito todavía no se arma");
  ok(armar.armarDE({ ...base(), emisorRazonSocial: armar.NOMBRE_EMISOR_PRUEBAS }, pg, { ...OPC, ambiente: "produccion" }).faltantes.some((f) => f.includes("ambiente de pruebas")), "el texto de pruebas como nombre en producción se rechaza");
  const prueba = armar.armarDE(base(), pg, OPC);
  igual([prueba.de.gDatGralOpe.gEmis.dNomEmi, prueba.de.gDtipDE.gCamItem[0].dDesProSer], [armar.NOMBRE_EMISOR_PRUEBAS, armar.NOMBRE_EMISOR_PRUEBAS], "en pruebas el nombre del emisor y la descripción del primer ítem llevan el texto de la Guía de Pruebas de la DNIT");
  igual(armar.armarDE(base(), pg, { ...OPC, ambiente: "produccion" }).de.gDtipDE.gCamItem[0].dDesProSer, "Almuerzo", "en producción el primer ítem conserva su descripción");
  ok(armar.armarDE({ ...base(), emisorRazonSocial: "DE generado en ambiente de prueba - sin valor comercial ni fiscal" }, pg, { ...OPC, ambiente: "produccion" }).faltantes.some((f) => f.includes("ambiente de pruebas")), "tampoco puede aparecer en producción la redacción del Manual de 2019");
  const prod = armar.armarDE(base(), pg, { ...OPC, ambiente: "produccion" });
  igual(prod.de.gDatGralOpe.gEmis.dNomEmi, "Gastronomía Fabri S.A.", "en producción es la razón social real");
  const sinAnio = armar.armarDE({ ...base(), items: [item("p", "Almuerzo", 30000, 1, "gravado10", 40000)], total: -10000 }, pg, OPC);
  ok(sinAnio.faltantes.length > 0, "una línea que cobra más de lo que vale se marca");

  // =================================================================================== E. los descriptores son los del esquema
  window.log("== Los textos descriptivos coinciden con los del esquema oficial");
  const enumDe = (complejo, campo) => { const tipo = E.COMPLEJOS[complejo].el.find((e) => e.n === campo).t; const d = E.SIMPLES[tipo]; return d.enum ?? d.union.find((u) => u.enum).enum; };
  const revisar = (tabla, complejo, campo, libres = []) => { const lista = enumDe(complejo, campo); const malos = Object.entries(tabla).filter(([k, v]) => !libres.includes(Number(k)) && !lista.includes(v)).map(([k, v]) => k + "=" + v); igual(malos, [], campo + ": todos los textos están en la lista del esquema"); };
  revisar(armar.DESCRIPCION_TIPO_DOCUMENTO, "tgDTim", "dDesTiDE");
  revisar(armar.DESCRIPCION_TIPO_EMISION, "tgCOpeDE", "dDesTipEmi");
  revisar(armar.DESCRIPCION_TIPO_TRANSACCION, "tgOpeCom", "dDesTipTra");
  revisar(armar.DESCRIPCION_PRESENCIA, "tgCamFE", "dDesIndPres", [9]);
  revisar(armar.DESCRIPCION_TIPO_PAGO, "tgPagCont", "dDesTiPag", [99]);
  revisar(armar.DESCRIPCION_DOCUMENTO_RECEPTOR, "tgDatRec", "dDTipIDRec", [9]);
  revisar(armar.DESCRIPCION_UNIDAD_MEDIDA, "tgCamItem", "dDesUniMed");
  revisar(armar.DESCRIPCION_AFECTACION_IVA, "tgCamIVA", "dDesAfecIVA");
  // cada código y su texto ocupan el mismo lugar en las dos listas del esquema
  const mismoLugar = (tabla, complejo, campoCodigo, campoTexto) => { const codigos = enumDe(complejo, campoCodigo).map(Number); const textos = enumDe(complejo, campoTexto); const malos = Object.entries(tabla).filter(([k, v]) => { const i = codigos.indexOf(Number(k)); return i < 0 || textos[i] !== v; }).map(([k, v]) => k + "=" + v); igual(malos, [], campoTexto + ": cada texto está en el mismo lugar que su código"); };
  mismoLugar(armar.DESCRIPCION_UNIDAD_MEDIDA, "tgCamItem", "cUniMed", "dDesUniMed");
  igual(enumDe("tgOpeCom", "dDesTipTra").slice(0, 3), [armar.DESCRIPCION_TIPO_TRANSACCION[1], armar.DESCRIPCION_TIPO_TRANSACCION[2], armar.DESCRIPCION_TIPO_TRANSACCION[3]], "tipo de transacción 1, 2 y 3: ocupan los primeros tres lugares de la lista, en orden");
  const dep = emi.DEPARTAMENTOS; const codsDep = enumDe("tgEmis", "cDepEmi").map(Number); const txtDep = enumDe("tgEmis", "dDesDepEmi");
  igual(dep.filter((d) => { const i = codsDep.indexOf(d.codigoSifen); return i < 0 || txtDep[i] !== d.descripcionSifen; }).map((d) => d.clave), [], "los 20 departamentos: código y texto coinciden con el esquema");

  // =================================================================================== F. miles de cuentas al azar
  window.log("== 3.000 facturas al azar: cuentas, esquema y (una de cada diez) libxml2");
  let semilla = 20261009;
  const azar = () => { semilla = (semilla + 0x6d2b79f5) | 0; let t = Math.imul(semilla ^ (semilla >>> 15), 1 | semilla); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const elegir = (a) => a[Math.floor(azar() * a.length)];
  const PRECIOS = [500, 1000, 1500, 2500, 3300, 5000, 7500, 9996, 12000, 15500, 27000, 33332, 45000, 100000, 250000, 1200000];
  const CANTIDADES = [1, 1, 1, 2, 3, 12, 4];
  const FRACCIONES = [0.5, 1.5, 0.25];
  let fallas = 0, conLibxml = 0, invalidosLibxml = 0, sumaTotales = 0;
  const detalle = [];
  const N = 3000;
  for (let n = 0; n < N; n++) {
    const cant = 1 + Math.floor(azar() * 6);
    const lineas = [];
    for (let i = 0; i < cant; i++) { const r = azar(); const precio = elegir(PRECIOS); lineas.push({ precio, cantidad: precio >= 9996 && azar() < 0.25 ? elegir(FRACCIONES) : elegir(CANTIDADES), iva: r < 0.7 ? "gravado10" : r < 0.85 ? "gravado5" : "exento" }); }
    const brutos = lineas.map((l) => l.precio * l.cantidad);
    const bruto = brutos.reduce((s, x) => s + x, 0);
    const pctDesc = azar() < 0.4 ? elegir([5, 10, 15, 20, 20, 100]) : 0;
    const D = Math.round((bruto * pctDesc) / 100);
    const exactos = brutos.map((b) => (bruto > 0 ? (b * D) / bruto : 0));
    const descs = exactos.map((x) => Math.floor(x));
    let faltaRepartir = D - descs.reduce((s, x) => s + x, 0);
    exactos.map((x, i) => [x - Math.floor(x), i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]).forEach(([, i]) => { if (faltaRepartir > 0 && descs[i] < brutos[i]) { descs[i] += 1; faltaRepartir -= 1; } });
    const items = lineas.map((l, i) => item("p" + i, "Producto " + i, l.precio, l.cantidad, l.iva, descs[i]));
    const total = items.reduce((s, x) => s + x.total, 0);
    const forma = elegir(["efectivo", "tarjeta_debito", "tarjeta_credito", "transferencia"]);
    const dosPagos = total > 1 && azar() < 0.4; const primero = dosPagos ? Math.floor(total * azar()) : total;
    const pagos = dosPagos ? [{ forma, monto: primero }, { forma: elegir(["efectivo", "transferencia"]), monto: total - primero }] : [{ forma, monto: total }];
    const tr = azar();
    const extra = tr < 0.25 ? { receptorTipoIdentificacion: "cedula", receptorNumeroIdentificacion: String(1000000 + Math.floor(azar() * 8000000)), receptorRazonSocial: "Cliente Número " + n, receptorEmail: null }
      : tr < 0.5 && total < 7000000 ? { receptorTipoIdentificacion: "sin_nombre", receptorNumeroIdentificacion: "", receptorRazonSocial: null, receptorEmail: null } : {};
    const c = comprobante(items, { correlativo: 1 + n, numero: "001-001-" + String(1 + n).padStart(7, "0"), ...extra });
    const res = armar.armarDE(c, total > 0 ? pagos : [{ forma: "efectivo", monto: 0 }], { ...OPC, codigoSeguridad: undefined });
    sumaTotales += total;
    let motivo = null;
    if (res.faltantes.length) motivo = "faltantes: " + res.faltantes.slice(0, 2).join(" | ");
    else if (!res.cdc || !cdc.cdcValido(res.cdc)) motivo = "CDC inválido";
    else if (Math.abs(res.de.gTotSub.dTotGralOpe - total) > 0.5) motivo = "el total del documento (" + res.de.gTotSub.dTotGralOpe + ") no es el de la venta (" + total + ")";
    else {
      const rde = armar.armarRDE(res.de, firmaFalsa(res.cdc), "https://ekuatia.set.gov.py/consultas-test/qr?" + "x".repeat(150));
      const e1 = xml.validarContraEsquema(rde); const e2 = ctl.controlarCalculos(res.de);
      if (e1.length) motivo = "esquema: " + e1[0].ruta + " " + e1[0].mensaje; else if (e2.length) motivo = "cuentas: " + e2[0];
      else if (n % 10 === 0) { conLibxml++; const r2 = await xsd(xml.aXmlRDE(rde)); if (!r2.valid) { invalidosLibxml++; motivo = "libxml2: " + r2.errors[0].message.slice(0, 200); } }
    }
    if (motivo) { fallas++; if (detalle.length < 5) detalle.push("#" + n + " " + motivo); }
  }
  igual(fallas, 0, N + " facturas al azar: todas sin faltantes, con CDC válido, cuentas que cierran y esquema OK" + (detalle.length ? " -> " + detalle.join(" ;; ") : ""));
  igual(invalidosLibxml, 0, conLibxml + " de ellas validadas también con libxml2 contra los XSD oficiales");
  window.log("   (" + N + " facturas, " + conLibxml + " de ellas también con libxml2; monto total facturado en la prueba: Gs. " + Math.round(sumaTotales).toLocaleString("es-PY") + ")");

  // =================================================================================== G. nuestro validador contra libxml2, con documentos rotos a propósito
  window.log("== Mutaciones: nuestro validador y libxml2 tienen que coincidir al rechazar un documento roto");
  const clon = (o) => JSON.parse(JSON.stringify(o));
  const hojas = []; const recorrer = (nodo, ruta) => { for (const [k, v] of Object.entries(nodo)) { if (k === "Signature") continue; if (Array.isArray(v)) v.forEach((x, i) => { if (x && typeof x === "object") recorrer(x, [...ruta, k, i]); else hojas.push([...ruta, k, i]); }); else if (v && typeof v === "object") recorrer(v, [...ruta, k]); else hojas.push([...ruta, k]); } };
  const baseRde = { dVerFor: 150, DE: clon(A.r.de), Signature: firmaFalsa(A.r.cdc), gCamFuFD: { dCarQR: A.q.url } };
  recorrer(baseRde.DE, ["DE"]);
  const aplicar = (rde, ruta, modo) => { const c2 = clon(rde); c2.Signature = rde.Signature; let o = c2; for (let i = 0; i < ruta.length - 1; i++) o = o[ruta[i]]; const ultimo = ruta[ruta.length - 1]; if (modo === "borrar") { if (Array.isArray(o)) o.splice(ultimo, 1); else delete o[ultimo]; } else if (modo === "texto") o[ultimo] = "ñ€x"; else if (modo === "vacio") o[ultimo] = ""; else if (modo === "enorme") o[ultimo] = "9".repeat(60); return c2; };
  let comparados = 0; const desacuerdos = [];
  for (const ruta of hojas) {
    if (ruta[ruta.length - 1] === "@Id") continue;
    for (const modo of ["borrar", "texto", "vacio", "enorme"]) {
      const m = aplicar(baseRde, ruta, modo);
      let nuestro; try { nuestro = xml.validarContraEsquema(m).length === 0; } catch (e) { nuestro = "ERROR " + e.message; }
      let texto; try { texto = xml.aXmlRDE(m); } catch (e) { texto = null; }
      if (texto === null) continue;
      const libxml = (await xsd(texto)).valid;
      comparados++;
      if (nuestro !== libxml) desacuerdos.push(modo + " " + ruta.join("/") + " (nuestro=" + nuestro + ", libxml2=" + libxml + ")");
    }
  }
  window.log("   (" + comparados + " documentos rotos comparados, sobre " + hojas.length + " campos del documento)");
  igual(desacuerdos.slice(0, 12), [], comparados + " documentos rotos a propósito: nuestro validador y libxml2 coinciden en todos (desacuerdos: " + desacuerdos.length + ")");

  window.log("\naciertos: " + window.__aciertos + " · fallas: " + window.__fallas);
  window.__listo = true;
})().catch((e) => { document.getElementById("salida").textContent += "\nERROR: " + (e && e.stack || e); window.__listo = true; window.__fallas = (window.__fallas || 0) + 1; });
