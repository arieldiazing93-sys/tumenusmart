// Pruebas de las piezas base de SIFEN contra los EJEMPLOS DEL MANUAL TÉCNICO v150 de la DNIT.
(async () => {
  const { ok, igual } = window;
  const C = window.Cargador;
  const cdc = await C.cargar("src/lib/sifen/cdc");
  const qr = await C.cargar("src/lib/sifen/qr");

  window.log("== CDC (Manual Técnico, sección 10.1: ejemplo '0144 4444 0170 0100 1001 4528 2201 7012 5158 7326 0988')");
  const EJEMPLO = "01444444017001001001452822017012515873260988";
  igual(cdc.digitoVerificadorModulo11("44444401"), 7, "el DV del RUC 44444401 es 7 (como en el manual: 44444401-7)");
  const partes = { tipoDocumento: 1, rucEmisor: "44444401", dvRuc: "7", establecimiento: "001", punto: "001", numero: "0014528", tipoContribuyente: 2, fecha: "20170125", tipoEmision: 1, codigoSeguridad: "587326098" };
  igual(cdc.construirCdc(partes), EJEMPLO, "con los datos del ejemplo sale exactamente el CDC del manual");
  ok(cdc.cdcValido(EJEMPLO), "el CDC del manual es válido (su dígito verificador cierra)");
  ok(!cdc.cdcValido(EJEMPLO.slice(0, 43) + "9") && !cdc.cdcValido("123") && !cdc.cdcValido(EJEMPLO.slice(0, 20) + "9" + EJEMPLO.slice(21)), "un CDC con un dígito cambiado o de otro largo no es válido");
  const d = cdc.descomponerCdc(EJEMPLO);
  igual(d && { t: d.tipoDocumento, r: d.rucEmisor, dv: d.dvRuc, e: d.establecimiento, p: d.punto, n: d.numero, c: d.tipoContribuyente, f: d.fecha, em: d.tipoEmision, s: d.codigoSeguridad, v: d.dvCdc },
    { t: 1, r: "44444401", dv: "7", e: "001", p: "001", n: "0014528", c: 2, f: "20170125", em: 1, s: "587326098", v: "8" }, "se separa en sus partes");
  igual(cdc.cdcParaMostrar(EJEMPLO), "0144 4444 0170 0100 1001 4528 2201 7012 5158 7326 0988", "se muestra en grupos de cuatro como en el KuDE del manual");
  // cualquier CDC armado por nosotros tiene que ser válido y volver a separarse igual
  let rotos = 0;
  for (let i = 0; i < 20000; i++) {
    const p = { tipoDocumento: [1, 4, 5, 6, 7][i % 5], rucEmisor: String(1000000 + ((i * 7919) % 90000000)), dvRuc: String(i % 10), establecimiento: String((i % 999) + 1).padStart(3, "0"), punto: String(((i * 3) % 999) + 1).padStart(3, "0"), numero: String(i + 1).padStart(7, "0"), tipoContribuyente: (i % 2) + 1, fecha: "2026" + String((i % 12) + 1).padStart(2, "0") + String((i % 28) + 1).padStart(2, "0"), tipoEmision: (i % 2) + 1, codigoSeguridad: cdc.generarCodigoSeguridad(String(i + 1).padStart(7, "0")) };
    const c = cdc.construirCdc(p); const r = cdc.descomponerCdc(c);
    if (c.length !== 44 || !cdc.cdcValido(c) || !r || r.numero !== p.numero || r.codigoSeguridad !== p.codigoSeguridad || r.rucEmisor !== p.rucEmisor.padStart(8, "0")) rotos++;
  }
  igual(rotos, 0, "20.000 CDC al azar: todos de 44 dígitos, válidos y se separan igual");

  window.log("== Código de seguridad (sección 10.3)");
  let suma = 0, malos = 0; const N = 20000;
  for (let i = 0; i < N; i++) {
    const cs = cdc.generarCodigoSeguridad("0000042");
    const n = Number(cs);
    if (!/^\d{9}$/.test(cs) || n < 1 || n > 999999999 || n === 42) malos++;
    suma += n;
  }
  igual(malos, 0, "siempre 9 dígitos, entre 000000001 y 999999999 y distinto del número de documento");
  ok(Math.abs(suma / N - 500000000) < 10000000, "reparto parejo (promedio " + Math.round(suma / N) + ")");
  let iguales = 0; for (let i = 0; i < 2000; i++) { if (cdc.generarCodigoSeguridad("0000001") === cdc.generarCodigoSeguridad("0000001")) iguales++; }
  ok(iguales <= 1, "dos seguidos casi nunca coinciden");
  let lanzo = false; try { cdc.construirCdc({ ...partes, rucEmisor: "123456789" }); } catch { lanzo = true; }
  ok(lanzo, "un RUC de más de 8 dígitos no entra: avisa en vez de armar un CDC roto");

  window.log("== QR (Manual Técnico, sección 13.8.4: ejemplo paso a paso)");
  const datos = { cdc: EJEMPLO, fechaEmision: "2017-01-25T09:35:17", idReceptor: "88899990", receptorConRuc: true, totalGeneral: 300000, totalIva: 27272, cantidadItems: 2, digestValue: "yzGYhUx1/XYYzksWB+fPR3Qc50c=", idCsc: "0001", csc: "ABCD0000000000000000000000000000", produccion: true };
  igual(qr.aHexadecimal("2017-01-25T09:35:17"), "323031372d30312d32355430393a33353a3137", "la fecha en hexadecimal es la del manual");
  igual(qr.aHexadecimal("yzGYhUx1/XYYzksWB+fPR3Qc50c="), "797a4759685578312f5859597a6b7357422b6650523351633530633d", "el DigestValue en hexadecimal es el del manual");
  const r = await qr.construirQr(datos);
  igual(r.parametros, "nVersion=150&Id=01444444017001001001452822017012515873260988&dFeEmiDE=323031372d30312d32355430393a33353a3137&dRucRec=88899990&dTotGralOpe=300000&dTotIVA=27272&cItems=2&DigestValue=797a4759685578312f5859597a6b7357422b6650523351633530633d&IdCSC=0001", "los parámetros (paso 1) son los del manual");
  igual(r.hash, "97ddbb3c1e7d65af03a70ffe21f2b34846ab1c89e0566c35222086766b7374ed", "el hash SHA-256 (paso 3) es el del manual");
  ok(!r.url.includes("ABCD0000"), "el CSC secreto NO aparece en la dirección");
  ok(r.url.includes("&cHashQR=") && !r.url.includes("&amp;"), "la dirección lleva & normales: el XML los escapa solo al escribirse (paso 5)");
  igual(r.url, "https://ekuatia.set.gov.py/consultas/qr?" + r.parametros + "&cHashQR=97ddbb3c1e7d65af03a70ffe21f2b34846ab1c89e0566c35222086766b7374ed", "la dirección completa (paso 4)");
  const rp = await qr.construirQr({ ...datos, produccion: false });
  ok(rp.url.startsWith("https://ekuatia.set.gov.py/consultas-test/qr?"), "en pruebas usa la dirección de consultas-test");
  const sinRuc = await qr.construirQr({ ...datos, receptorConRuc: false, idReceptor: "0" });
  ok(sinRuc.parametros.includes("&dNumIDRec=0&") && !sinRuc.parametros.includes("dRucRec"), "comprador sin RUC (innominado): va dNumIDRec=0");
  const ceros = await qr.construirQr({ ...datos, totalIva: 0 });
  ok(ceros.parametros.includes("&dTotIVA=0&"), "un monto sin valor va como 0");
  let malo = false; try { await qr.construirQr({ ...datos, csc: "" }); } catch { malo = true; }
  ok(malo, "sin CSC no arma el QR");

  window.log("\naciertos: " + window.__aciertos + " · fallas: " + window.__fallas);
  window.__listo = true;
})().catch((e) => { document.getElementById("salida").textContent += "\nERROR: " + (e && e.stack || e); window.__listo = true; window.__fallas = (window.__fallas || 0) + 1; });
