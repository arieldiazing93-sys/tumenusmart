// Prueba de la emisión de la factura electrónica AL VENDER: crearComprobante (src/lib/comprobante.ts) con un punto de expedición
// electrónico arma, firma y guarda el documento dentro de la misma transacción, o falla con un texto claro. La base de datos se
// reemplaza por una en memoria; todo lo demás (armado, firma, bóveda, controles) es el código real.
(async () => {
  const { ok, igual } = window;
  const C = window.Cargador;
  const S = C.simulacros;
  S["node-forge"] = window.forge;
  const forge = window.forge;

  // ---------------------------------------------------------------- la bóveda de prueba: un certificado, su CSC y la clave maestra
  const claveMaestra = forge.util.encode64(forge.random.getBytesSync(32));
  window.process = { env: { CERTIFICADOS_CLAVE: claveMaestra } };
  const cert = await C.cargar("src/lib/sifen/certificado");
  const firma = await C.cargar("src/lib/sifen/firma");
  const cdcLib = await C.cargar("src/lib/sifen/cdc");
  const muestras = window.MUESTRAS_P12;
  const leido = cert.leerCertificadoP12(muestras.moderno, muestras.clave).certificado; // RUC 80012345-0
  const storeId = "local-1";
  const CSC = "ABCD0000000000000000000000000000";
  const filaCertificado = {
    id: "c1", storeId, activo: true, validoHasta: new Date(Date.now() + 200 * 864e5), huellaSha256: leido.huellaSha256,
    certificadoBase64: leido.certificadoBase64, clavePrivadaCifrada: await cert.cifrarSecreto(leido.clavePrivadaPem, claveMaestra, storeId),
    sujeto: leido.sujeto, emisor: leido.emisor, ruc: leido.ruc, dv: leido.dv, validoDesde: new Date(Date.now() - 864e5), bitsClave: 2048,
    usoAutenticacionCliente: true, avisos: [], subidoPor: "Prueba", createdAt: new Date(),
  };
  const filaConfig = { storeId, ambiente: "pruebas", idCsc: "0001", cscCifrado: await cert.cifrarSecreto(CSC, claveMaestra, storeId) };
  const filaEmisor = { tipoContribuyente: "persona_juridica", tipoRegimen: null, nombreFantasia: "Lo de Fabri", denominacionSucursal: "Casa central", telefono: "0981123456", email: "fabri@correo.com.py", direccion: "Av. Mariscal López", numeroCasa: "1234", complemento: null, departamento: "capital", distritoCodigo: 1, distrito: null, ciudadCodigo: 1, ciudad: null, actividades: [{ codigo: "56101", descripcion: "Restaurantes y parrillas" }] };

  // ---------------------------------------------------------------- la base en memoria (compartida por todas las pruebas)
  const BF = window.BaseFalsa;
  BF.reiniciar();
  const db = BF.db;
  BF.instalar(S);
  // Las filas que ve el código: se ponen y se sacan según lo que cada caso necesita.
  const poner = (nombre, fila) => { BF.tablas[nombre] = fila ? [fila] : []; };
  const estado = {
    set certificado(v) { poner("certificadoFirma", v); },
    set config(v) { poner("configFacturacionElectronica", v); },
    set emisor(v) { poner("emisorFiscal", v ? { storeId, ...v } : null); },
  };
  estado.certificado = filaCertificado; estado.config = filaConfig; estado.emisor = filaEmisor;
  let pagos = [{ forma: "efectivo", monto: 120600 }];
  const poblarPagos = () => { BF.tablas.pagoVenta = pagos.map((p, i) => ({ ventaPosId: "venta-1", ...p, orden: i })); };
  poblarPagos();
  const guardado = { get comprobantes() { return BF.tablas.comprobante || []; }, get documentos() { return BF.tablas.documentoElectronico || []; } };

  const comprobante = await C.cargar("src/lib/comprobante");
  const servidor = await C.cargar("src/lib/sifen/servidor");
  const { ErrorFacturaElectronica } = servidor;

  const punto = (modalidad) => ({ id: "p1", establecimiento: "001", puntoExpedicion: "001", numeroTimbrado: "80012345", timbradoDesde: new Date("2026-01-01T03:00:00Z"), timbradoHasta: new Date("2999-12-31T00:00:00Z"), razonSocialEmisor: "Gastronomía Fabri S.A.", rucEmisor: "80012345-0", modalidad });
  const items = [
    { productId: "p-1", descripcion: "Pizza muzzarella", unidadMedida: "unidad", esServicio: false, cantidad: 2, precioUnitario: 55000, iva: "gravado10" },
    { productId: "p-2", descripcion: "Gaseosa 2 L", unidadMedida: "unidad", esServicio: false, cantidad: 3, precioUnitario: 8000, iva: "gravado10" },
  ];
  const venta = (extra = {}) => ({
    storeId, origen: { ventaPosId: "venta-1" }, punto: punto("electronico"), correlativo: 47,
    receptor: { tipoIdentificacion: "ruc", numeroIdentificacion: "80069563-1", razonSocial: "Cliente de Prueba S.A.", email: "cliente@correo.com" },
    presencia: "presencial", condicion: "contado", fechaVencimientoCredito: null, items, descuento: 13400, emitidoPor: "Ariel", ...extra,
  });
  const falla = async (datos) => { try { await comprobante.crearComprobante(db, datos); return null; } catch (e) { return e; } };

  window.log("== Local con timbrado electrónico: la factura se firma al emitirla");
  const creado = await comprobante.crearComprobante(db, venta());
  igual(creado.numero, "001-001-0000047", "el comprobante sale con el número del punto");
  const c = guardado.comprobantes[0];
  ok(c.modalidad === "electronico" && c.timbrado === "80012345" && c.timbradoHasta.getUTCFullYear() === 2999, "queda como electrónico, con el timbrado del punto y sin vencimiento");
  ok(guardado.documentos.length === 1, "y se guardó UN documento electrónico firmado");
  const d = guardado.documentos[0];
  ok(d.comprobanteId === creado.id && d.storeId === storeId && d.estado === "firmado" && d.vistaPrevia === false && d.ambiente === "pruebas", "ligado a su comprobante y a su local, firmado, no es vista previa y en el ambiente de la configuración");
  ok(d.huellaCertificado === leido.huellaSha256 && d.firmadoPor === "Ariel", "con la huella del certificado con que se firmó y quién emitió");
  const v = await firma.verificarFirmaXml(d.xmlFirmado);
  ok(v.valida && v.cdc === d.cdc, "la firma del documento guardado se verifica con el certificado");
  const partes = cdcLib.descomponerCdc(d.cdc);
  ok(partes && partes.establecimiento === "001" && partes.punto === "001" && partes.numero === "0000047" && partes.rucEmisor === "80012345" && partes.dvRuc === "0", "el CDC lleva el establecimiento, el punto, el número y el RUC de la factura");
  ok(d.xmlFirmado.includes("<dTotGralOpe>120600</dTotGralOpe>") && d.xmlFirmado.includes("<dNumTim>80012345</dNumTim>"), "el total (134.000 − 13.400 de descuento) y el timbrado están dentro del documento");
  const m = (await C.cargar("src/lib/sifen/kude")).construirKude(d.xmlFirmado);
  igual([m.numero, m.totales.totalOperacion, m.pagos.map((p) => p.forma)], ["001-001-0000047", "120.600", ["Efectivo"]], "el comprobante impreso sale del documento: número, total y forma de pago");

  window.log("== Pago dividido y crédito");
  pagos = [{ forma: "efectivo", monto: 70000 }, { forma: "tarjeta_debito", monto: 50600 }]; poblarPagos();
  await comprobante.crearComprobante(db, venta({ correlativo: 48 }));
  const m2 = (await C.cargar("src/lib/sifen/kude")).construirKude(guardado.documentos[1].xmlFirmado);
  igual(m2.pagos.map((p) => p.forma), ["Efectivo", "Tarjeta de débito"], "el pago dividido lleva cada forma de pago");
  await comprobante.crearComprobante(db, venta({ correlativo: 49, condicion: "credito", fechaVencimientoCredito: new Date("2026-11-08T00:00:00Z") }));
  const m3 = (await C.cargar("src/lib/sifen/kude")).construirKude(guardado.documentos[2].xmlFirmado);
  ok(m3.condicion === "Crédito" && m3.pagos.length === 0, "a crédito: sale con su plazo y sin formas de pago (y no se leyeron los pagos)");

  window.log("== Local con timbrado autoimpresor: igual que siempre");
  const antes = guardado.documentos.length;
  await comprobante.crearComprobante(db, venta({ correlativo: 50, punto: punto("autoimpresor") }));
  ok(guardado.documentos.length === antes && guardado.comprobantes[3].modalidad === "autoimpresor", "no se firma nada y el comprobante sale como autoimpresor");
  await comprobante.crearComprobante(db, venta({ correlativo: 51, punto: { ...punto("autoimpresor"), modalidad: undefined } }));
  ok(guardado.comprobantes[4].modalidad === "autoimpresor" && guardado.documentos.length === antes, "sin dato de modalidad (un punto de antes) se trata como autoimpresor");

  window.log("== Cuando no se puede emitir, falla con un texto claro (y la venta se deshace)");
  const base = guardado.documentos.length;
  estado.certificado = null;
  let e1 = await falla(venta({ correlativo: 60 }));
  ok(e1 instanceof ErrorFacturaElectronica && e1.message.includes("No se pudo emitir la factura electrónica") && e1.message.includes("certificado digital"), "sin certificado: ErrorFacturaElectronica con el motivo → " + (e1 && e1.message));
  estado.certificado = { ...filaCertificado, validoHasta: new Date(Date.now() - 864e5) };
  e1 = await falla(venta({ correlativo: 61 }));
  ok(e1 instanceof ErrorFacturaElectronica && e1.message.includes("vencido"), "con el certificado vencido: lo dice");
  estado.certificado = filaCertificado;
  estado.config = { ...filaConfig, cscCifrado: null };
  e1 = await falla(venta({ correlativo: 62 }));
  ok(e1 instanceof ErrorFacturaElectronica && e1.message.includes("código de seguridad"), "sin el código de seguridad (CSC): lo dice");
  estado.config = filaConfig;
  estado.emisor = null;
  e1 = await falla(venta({ correlativo: 63 }));
  ok(e1 instanceof ErrorFacturaElectronica && e1.message.includes("Faltan datos") && e1.message.includes("Tipo de contribuyente") && e1.message.includes("Dirección"), "sin los datos del emisor: dice cuáles faltan");
  estado.emisor = filaEmisor;
  window.process.env.CERTIFICADOS_CLAVE = forge.util.encode64(forge.random.getBytesSync(32));
  e1 = await falla(venta({ correlativo: 64 }));
  ok(e1 instanceof ErrorFacturaElectronica && e1.message.includes("No se pudo abrir el certificado"), "con otra clave maestra en el servidor: no abre el certificado y no da detalles");
  window.process.env.CERTIFICADOS_CLAVE = "";
  e1 = await falla(venta({ correlativo: 65 }));
  ok(e1 instanceof ErrorFacturaElectronica && e1.message.includes("CERTIFICADOS_CLAVE"), "sin clave maestra en el servidor: se niega (no hay modo sin cifrar)");
  window.process.env.CERTIFICADOS_CLAVE = claveMaestra;
  e1 = await falla(venta({ correlativo: 66, origen: { cuentaDeliveryId: "cuenta-1" }, condicion: "contado" }));
  ok(e1 instanceof ErrorFacturaElectronica && e1.message.includes("al cobrar la cuenta"), "la factura rápida del delivery (antes de cobrar) no se puede firmar: no se sabe cómo se paga");
  e1 = await falla(venta({ correlativo: 67, origen: { orderId: "pedido-1" } }));
  ok(e1 instanceof ErrorFacturaElectronica && e1.message.includes("punto de venta"), "un pedido online tampoco: se pide una venta del punto de venta");
  const mal = await falla(venta({ correlativo: 68, receptor: { tipoIdentificacion: "ruc", numeroIdentificacion: "80069563-9", razonSocial: "Cliente", email: null } }));
  ok(mal instanceof ErrorFacturaElectronica && mal.message.includes("dígito verificador"), "un RUC de comprador con el dígito mal también frena la emisión, antes de mandarlo a la DNIT");
  ok(guardado.documentos.length === base, "en ninguno de esos casos quedó un documento guardado");

  window.log("== Antes de vender: ¿está todo listo?");
  igual(await servidor.problemaParaEmitirElectronico(storeId), null, "con todo cargado no hay problema");
  estado.certificado = null; estado.config = null;
  const p1 = await servidor.problemaParaEmitirElectronico(storeId);
  ok(p1 && p1.includes("certificado digital") && p1.includes("código de seguridad") && p1.includes("Configuración de facturas → Facturación electrónica"), "si falta algo lo dice en palabras de la caja y dónde se completa: " + p1);
  estado.certificado = filaCertificado; estado.config = filaConfig;
  window.process.env.CERTIFICADOS_CLAVE = "";
  const p2 = await servidor.problemaParaEmitirElectronico(storeId);
  ok(p2 && p2.includes("CERTIFICADOS_CLAVE"), "sin la clave de la bóveda también avisa");
  window.process.env.CERTIFICADOS_CLAVE = claveMaestra;

  window.log("\naciertos: " + window.__aciertos + " · fallas: " + window.__fallas);
  window.__listo = true;
})().catch((e) => { document.getElementById("salida").textContent += "\nERROR: " + (e && e.stack || e); window.__listo = true; window.__fallas = (window.__fallas || 0) + 1; });
