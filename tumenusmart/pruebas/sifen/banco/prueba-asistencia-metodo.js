// Prueba del Registro de asistencia: cómo se marca (solo PIN o PIN y cámara), el PIN de 3 números y el rechazo inmediato de una cara
// que claramente es de otra persona (src/lib/asistencia.ts y src/lib/reconocimiento-facial.ts). Todo son reglas puras.
(async () => {
  const { ok, igual } = window;
  const C = window.Cargador;
  const a = await C.cargar("src/lib/asistencia");
  const rf = await C.cargar("src/lib/reconocimiento-facial");

  window.log("== Asistencia: el PIN de 3 números");
  ok(a.LARGO_PIN === 3, "el PIN nuevo tiene 3 números");
  ok(a.pinNuevoValido("482") && a.pinNuevoValido("007"), "un PIN nuevo: 3 números (también con ceros)");
  for (const malo of ["", "12", "1234", "12a", " 48", "4 8", "48.", "-48"]) {
    ok(!a.pinNuevoValido(malo), `«${malo}» no sirve como PIN nuevo`);
  }
  ok(a.pinValido("482") && a.pinValido("4827") && a.pinValido("482715"), "al marcar se acepta de 3 a 6 (los PIN viejos siguen andando)");
  ok(!a.pinValido("48") && !a.pinValido("4827159") && !a.pinValido("48a"), "pero no menos de 3, ni más de 6, ni letras");
  ok(a.pinDemasiadoFacil("111") && a.pinDemasiadoFacil("123") && a.pinDemasiadoFacil("321") && a.pinDemasiadoFacil("000"), "111, 123, 321 y 000 son demasiado fáciles");
  ok(!a.pinDemasiadoFacil("482") && !a.pinDemasiadoFacil("159") && !a.pinDemasiadoFacil("120"), "482, 159 y 120 sirven");
  // De los 1.000 PIN de 3 números, ¿cuántos se rechazan por fáciles? (iguales: 10; seguidos hacia arriba: 8; hacia abajo: 8.)
  let faciles = 0;
  for (let n = 0; n < 1000; n++) if (a.pinDemasiadoFacil(String(n).padStart(3, "0"))) faciles++;
  ok(faciles === 26, "26 de los 1.000 son demasiado fáciles y quedan 974 (" + faciles + ")");

  window.log("== Asistencia: cómo se marca");
  igual(a.METODOS_ASISTENCIA.map((m) => m.valor), ["pin", "pin_y_camara"], "dos métodos: solo PIN, o PIN y cámara");
  igual(a.normalizarMetodoAsistencia("pin"), "pin", "«pin» se respeta");
  igual(a.normalizarMetodoAsistencia("pin_y_camara"), "pin_y_camara", "«pin_y_camara» se respeta");
  igual(a.normalizarMetodoAsistencia(undefined), "pin_y_camara", "sin dato, el de siempre: PIN y cámara");
  igual(a.normalizarMetodoAsistencia(null), "pin_y_camara", "nulo: PIN y cámara");
  igual(a.normalizarMetodoAsistencia("huella"), "pin_y_camara", "algo raro: PIN y cámara (nunca se baja la seguridad por error)");

  window.log("== Asistencia: lo marcado solo con PIN no es «sin verificar»");
  const dia = "2026-10-15";
  const f = (h) => new Date(`${dia}T${h}:00-03:00`);
  const marca = (id, tipo, h, extra) => ({ id, tipo, fecha: f(h), tardanzaMin: null, verificada: false, ...extra });
  const soloPin = a.armarTurnos([marca("1", "entrada", "08:00", { metodo: "pin" }), marca("2", "salida", "17:00", { metodo: "pin" })], dia, "2026-10-16");
  ok(soloPin.length === 1 && !soloPin[0].avisos.some((x) => x.includes("cámara")), "con solo PIN no avisa «la cámara no vio su cara»");
  const sinVer = a.armarTurnos([marca("1", "entrada", "08:00", { metodo: "pin_y_camara" }), marca("2", "salida", "17:00", { metodo: "pin_y_camara", verificada: true })], dia, "2026-10-16");
  ok(sinVer[0].avisos.some((x) => x.includes("cámara")), "con cámara y sin verificar sí avisa (para revisar la foto)");
  const viejas = a.armarTurnos([marca("1", "entrada", "08:00"), marca("2", "salida", "17:00")], dia, "2026-10-16");
  ok(viejas[0].avisos.some((x) => x.includes("cámara")), "una marcación de antes (sin dato de método) sigue avisando como siempre");

  window.log("== Reconocimiento: cuándo es claramente otra persona");
  ok(rf.UMBRAL_ROSTRO === 0.5 && rf.UMBRAL_OTRA_PERSONA === 0.65, "pasa hasta 0,50 y es otra persona desde 0,65");
  ok(!rf.esOtraPersona(0.3) && !rf.esOtraPersona(0.52) && !rf.esOtraPersona(0.64), "0,30, 0,52 y 0,64: no es seguro que sea otra (se deja repetir la selfie)");
  ok(rf.esOtraPersona(0.65) && rf.esOtraPersona(0.8) && rf.esOtraPersona(1.2), "0,65 en adelante: otra persona, se rechaza al toque");
  // La zona dudosa y la de rechazo seguro no se pisan con la de coincidencia.
  const base = new Array(128).fill(0);
  const otra = (d) => { const v = new Array(128).fill(0); v[0] = d; return v; };
  ok(rf.compararRostros(base, otra(0.4)).coincide && !rf.esOtraPersona(rf.compararRostros(base, otra(0.4)).distancia), "una cara a 0,40: coincide");
  const dudosa = rf.compararRostros(base, otra(0.58));
  ok(!dudosa.coincide && !rf.esOtraPersona(dudosa.distancia), "una a 0,58: no coincide pero tampoco es seguro que sea otra (reintento)");
  const otraCara = rf.compararRostros(base, otra(0.9));
  ok(!otraCara.coincide && rf.esOtraPersona(otraCara.distancia), "una a 0,90: no coincide y es claramente otra persona (rechazo definitivo)");

  window.log("\naciertos: " + window.__aciertos + " · fallas: " + window.__fallas);
  window.__listo = true;
})().catch((e) => { document.getElementById("salida").textContent += "\nERROR: " + (e && e.stack || e); window.__listo = true; window.__fallas = (window.__fallas || 0) + 1; });
