// Pruebas del generador de QR (src/lib/qr.ts): el QR del comprobante electrónico mide unos 400 bytes y tiene que poder leerse
// con cualquier lector. El juez es jsQR, un lector completo escrito por otros (no conoce nuestro código): si lo decodifica y
// el texto sale idéntico, la forma, la corrección de errores, las máscaras y la información de versión están bien.
(async () => {
  const { ok, igual } = window;
  const C = window.Cargador;
  const qr = await C.cargar("src/lib/qr");
  const qrSifen = await C.cargar("src/lib/sifen/qr");
  const jsQR = window.jsQR;
  ok(typeof jsQR === "function", "el lector de QR independiente (jsQR) está cargado");

  // La matriz de módulos a una imagen en blanco y negro, con la zona de silencio de 4 módulos, como la ve un lector.
  function leer(matriz, escala = 4) {
    const n = matriz.length, lado = (n + 8) * escala;
    const px = new Uint8ClampedArray(lado * lado * 4).fill(255);
    for (let f = 0; f < n; f++) for (let c = 0; c < n; c++) {
      if (!matriz[f][c]) continue;
      for (let y = 0; y < escala; y++) for (let x = 0; x < escala; x++) {
        const i = (((f + 4) * escala + y) * lado + (c + 4) * escala + x) * 4;
        px[i] = px[i + 1] = px[i + 2] = 0;
      }
    }
    const r = jsQR(px, lado, lado);
    return r ? r.data : null;
  }

  let sem = 12345;
  const azar = () => { sem = (sem * 1103515245 + 12345) & 0x7fffffff; return sem / 0x7fffffff; };
  const ALFABETO = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789&=/?:._-";
  const texto = (largo) => Array.from({ length: largo }, () => ALFABETO[Math.floor(azar() * ALFABETO.length)]).join("");

  window.log("== Lectura con jsQR, por tamaño (cada versión del 1 al 20, en sus límites)");
  // Capacidad en bytes (modo byte, nivel M) de cada versión 1..20, según la tabla del estándar ISO/IEC 18004.
  const CAPACIDAD = [14, 26, 42, 62, 84, 106, 122, 152, 180, 213, 251, 287, 331, 362, 412, 450, 504, 560, 624, 666];
  let fallas = 0, probados = 0;
  for (let v = 1; v <= 20; v++) {
    const maxV = CAPACIDAD[v - 1];
    const minV = v === 1 ? 1 : CAPACIDAD[v - 2] + 1;
    for (const largo of new Set([minV, Math.floor((minV + maxV) / 2), maxV])) {
      const t = texto(largo);
      let m; try { m = qr.generarMatrizQR(t); } catch (e) { fallas++; window.log("FALLA: v" + v + " largo " + largo + " no se generó: " + e.message); continue; }
      probados++;
      if (m.length !== 17 + 4 * v) { fallas++; window.log("FALLA: largo " + largo + " debería ser versión " + v + " (" + (17 + 4 * v) + " módulos) y salió de " + m.length); continue; }
      if (leer(m) !== t) { fallas++; window.log("FALLA: v" + v + " largo " + largo + ": jsQR no devuelve el mismo texto"); }
    }
  }
  igual([probados, fallas], [60, 0], "60 textos (3 por versión, en los bordes): todos se generan en la versión esperada y jsQR los lee idénticos");
  let muchos = 0;
  for (let i = 0; i < 120; i++) {
    const largo = 330 + Math.floor(azar() * 240); // el rango de los QR de SIFEN y un poco más
    const t = texto(largo);
    if (leer(qr.generarMatrizQR(t)) !== t) muchos++;
  }
  igual(muchos, 0, "120 textos al azar de 330 a 570 bytes (versiones 14 a 20): jsQR los lee todos");

  let msg = ""; try { qr.generarMatrizQR(texto(667)); } catch (e) { msg = e.message; }
  ok(msg.includes("demasiado largo"), "uno de 667 bytes no entra: error claro");

  window.log("== El QR del comprobante electrónico (la dirección completa con el hash)");
  const base = { cdc: "01800123457001001000004712026100917300501587326098".slice(0, 44), fechaEmision: "2026-10-09T17:30:05", totalGeneral: 150000, totalIva: 13636, cantidadItems: 3, digestValue: "yzGYhUx1/XYYzksWB+fPR3Qc50c=" + "A".repeat(16), idCsc: "0001", csc: "ABCD0000000000000000000000000000", produccion: false };
  const casos = [
    ["típico (comprador con RUC de 8 dígitos, 150.000 Gs)", { ...base, idReceptor: "80069563", receptorConRuc: true }],
    ["cédula de 7 dígitos, 25 ítems", { ...base, idReceptor: "4987017", receptorConRuc: false, cantidadItems: 25 }],
    ["total de mil millones", { ...base, idReceptor: "80069563", receptorConRuc: true, totalGeneral: 1_000_000_000, totalIva: 90_909_091 }],
    ["documento de 20 caracteres y total enorme (el peor caso)", { ...base, idReceptor: "A1B2C3D4E5F6G7H8I9J0", receptorConRuc: false, totalGeneral: 99_999_999_999_999, totalIva: 9_999_999_999_999, cantidadItems: 999 }],
    ["producción", { ...base, idReceptor: "80069563", receptorConRuc: true, produccion: true }],
  ];
  for (const [nombre, datos] of casos) {
    const r = await qrSifen.construirQr(datos);
    const bytes = new TextEncoder().encode(r.url).length;
    let leido = null, error = "";
    try { leido = leer(qr.generarMatrizQR(r.url)); } catch (e) { error = e.message; }
    ok(leido === r.url, nombre + " (" + bytes + " bytes): jsQR lee el QR y devuelve la dirección exacta" + (error ? " -> " + error : ""));
  }
  window.log("\naciertos: " + window.__aciertos + " · fallas: " + window.__fallas);
  window.__listo = true;
})().catch((e) => { document.getElementById("salida").textContent += "\nERROR: " + (e && e.stack || e); window.__listo = true; window.__fallas = (window.__fallas || 0) + 1; });
