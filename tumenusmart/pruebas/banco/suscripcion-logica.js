// El vencimiento y la suspensión de un local: activar (31 días fijos), registrar pago, suspender/reactivar, con las acciones REALES del
// panel de Super y las reglas puras de src/lib/suscripcion.ts. Lo que se cuida: las cuentas de los días exactas (un día de más o de
// menos es plata) y que «suspendido» (a mano) sea lo único que impide registrar ventas.
(async () => {
  const C = window.Cargador; const S = C.simulacros; const { ok, igual } = window;

  let local, pagos, bitacoras, estadoDelLocal;
  const reiniciar = (extra = {}) => { local = { id: "L1", estado: "activo", vencimiento: null, ...extra }; pagos = []; bitacoras = []; estadoDelLocal = local.estado; };
  S["next/cache"] = { revalidatePath() {} };
  S["src/lib/auth"] = {
    exigirSuperadmin: async () => ({ nombre: "Dueño", email: "dueno@x.com", rol: "superadmin" }),
    cifrarPassword: async (p) => "h:" + p, generarPassword: () => "clave", normalizarEmail: (e) => String(e).trim().toLowerCase(),
  };
  S["src/lib/prisma"] = {
    prisma: {
      store: {
        findUnique: async () => ({ ...local, estado: local.estado }),
        update: async ({ data }) => { Object.assign(local, data); return local; },
        updateMany: async ({ where, data }) => { if (where.vencimiento === null && local.vencimiento !== null) return { count: 0 }; Object.assign(local, data); return { count: 1 }; },
      },
      pago: { create: async ({ data }) => { pagos.push(data); return data; } },
      bitacora: { create: async ({ data }) => { bitacoras.push(data); return data; } },
      $transaction: async (lista) => Promise.all(lista),
    },
  };

  const Sus = await C.cargar("src/lib/suscripcion");
  const Susp = await C.cargar("src/lib/suspension");
  const A = await C.cargar("src/app/admin/(protected)/super/actions");

  const dia = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Asuncion" }).format(d);          // AAAA-MM-DD en Asunción
  const asu = (texto) => new Date(texto + "-03:00");                                                     // un instante dicho en hora de Asunción
  const diasDeServicio = (desde, vencimiento) => Math.round((Date.parse(dia(vencimiento) + "T00:00:00Z") - Date.parse(dia(desde) + "T00:00:00Z")) / 86400000) + 1;

  // ---------------------------------------------------------------------------------------------- activar: 31 días fijos
  window.log("== Activar: 31 días fijos");
  let v = Sus.calcularVencimientoDeActivacion(asu("2026-10-18T12:00:00"));
  igual(dia(v), "2026-11-17", "activado el 18/10 → vence el 17/11 (inclusive)");
  igual(dia(Sus.momentoDeCorte(v)), "2026-11-18", "y se apaga a la medianoche: el primer día SIN servicio es el 18/11");
  igual(Sus.estadoSuscripcion({ estado: "activo", vencimiento: v }, asu("2026-10-18T12:00:00")).etiqueta, "Vence en 31 días", "el panel dice «Vence en 31 días»");
  ok(diasDeServicio(asu("2026-10-18T12:00:00"), v) === 31, "31 días de servicio contando el primero y el último");
  igual(dia(Sus.calcularVencimientoDeActivacion(asu("2026-01-31T23:59:00"))), "2026-03-02", "activado el 31/01 a las 23:59 → 02/03 (31 días, sin saltarse febrero)");
  igual(dia(Sus.calcularVencimientoDeActivacion(asu("2026-10-01T00:01:00"))), "2026-10-31", "activado el 01/10 a las 00:01 → 31/10");
  igual(dia(Sus.calcularVencimientoDeActivacion(asu("2026-12-15T08:00:00"))), "2027-01-14", "cruza el año: 15/12 → 14/01");
  igual(dia(Sus.calcularVencimientoDeActivacion(asu("2028-02-01T09:00:00"))), "2028-03-02", "año bisiesto: 01/02/2028 → 02/03/2028");
  let todosJustos = true; let malo = "";
  for (let i = 0; i < 800; i++) {
    const ahora = new Date(asu("2026-01-01T00:00:00").getTime() + i * 86400000 + ((i * 7919) % 86400) * 1000);   // 800 días, a distintas horas
    const venc = Sus.calcularVencimientoDeActivacion(ahora);
    const corte = Sus.momentoDeCorte(venc);
    if (diasDeServicio(ahora, venc) !== 31 || Sus.estaVencido(venc, new Date(corte.getTime() - 60000), "America/Asuncion") || !Sus.estaVencido(venc, corte, "America/Asuncion")) { todosJustos = false; malo = ahora.toISOString(); break; }
  }
  ok(todosJustos, "800 activaciones a distintas horas: siempre 31 días justos, atiende hasta un minuto antes de la medianoche y se apaga a las 00:00 → " + malo);

  // ---------------------------------------------------------------------------------------------- las renovaciones (meses de calendario)
  window.log("== Renovar: registrar pago");
  const vence26 = asu("2026-10-26T00:00:00");
  igual(dia(Sus.calcularNuevoVencimiento(vence26, 1, asu("2026-10-26T10:00:00"))), "2026-11-26", "paga el mismo día del vencimiento (26/10) → 26/11");
  igual(dia(Sus.calcularNuevoVencimiento(vence26, 1, asu("2026-10-20T10:00:00"))), "2026-11-26", "paga antes → 26/11 (no pierde ningún día)");
  igual(dia(Sus.calcularNuevoVencimiento(vence26, 1, asu("2026-10-27T01:00:00"))), "2026-11-27", "paga ya vencido (27/10) → 27/11, desde hoy");
  ok(!Sus.estaVencido(vence26, asu("2026-10-26T23:59:00")) && Sus.estaVencido(vence26, asu("2026-10-27T00:00:00")), "el 26/10 atiende todo el día y se corta a la medianoche");

  // ---------------------------------------------------------------------------------------------- las acciones de Super
  window.log("== Super → Activar");
  reiniciar();
  const antes = Sus.calcularVencimientoDeActivacion();
  let r = await A.activarLocal("L1");
  const despues = Sus.calcularVencimientoDeActivacion();
  ok(r.ok === true && local.estado === "activo" && [antes.getTime(), despues.getTime()].includes(local.vencimiento.getTime()), "activar deja los 31 días fijos desde hoy → " + (local.vencimiento ? dia(local.vencimiento) : "sin fecha"));
  r = await A.activarLocal("L1");
  ok(r.ok === false && /ya está activado/.test(r.error), "activar dos veces no le corre el plazo otra vez");
  reiniciar({ estado: "suspendido" }); r = await A.activarLocal("L1");
  ok(r.ok === false && /suspendido/.test(r.error), "un local suspendido a mano no se activa: primero se reactiva");

  window.log("== Super → Registrar pago");
  const formulario = (meses) => { const f = new FormData(); f.set("meses", String(meses)); f.set("monto", "100000"); return f; };
  reiniciar();
  r = await A.registrarPago("L1", formulario(1));
  ok(r.ok === true && dia(local.vencimiento) === dia(Sus.calcularVencimientoDeActivacion()) && pagos.length === 1, "el primer pago de un local sin activar también arranca con 31 días (igual que Activar) → " + dia(local.vencimiento));
  reiniciar();
  r = await A.registrarPago("L1", formulario(3));
  ok(r.ok === true && dia(local.vencimiento) === dia(Sus.calcularNuevoVencimiento(Sus.calcularVencimientoDeActivacion(), 2)), "con 3 meses: los 31 días de arranque más 2 meses de calendario → " + dia(local.vencimiento));
  reiniciar({ vencimiento: asu("2026-10-26T00:00:00") });
  r = await A.registrarPago("L1", formulario(1));
  ok(r.ok === true && local.estado === "activo" && pagos[0].cubreHasta.getTime() === local.vencimiento.getTime(), "un local con fecha: se suman los meses de calendario y queda guardado el historial del pago");
  reiniciar({ estado: "suspendido", vencimiento: asu("2026-12-26T00:00:00") });
  r = await A.registrarPago("L1", formulario(1));
  ok(r.ok === true && local.estado === "activo", "registrar un pago reactiva aunque estuviera suspendido (queda como estaba definido)");

  // ---------------------------------------------------------------------------------------------- suspender y reactivar
  window.log("== Super → Suspender / Reactivar");
  reiniciar({ vencimiento: asu("2026-12-26T00:00:00") });
  await A.alternarSuspension("L1", true);
  ok(local.estado === "suspendido" && dia(local.vencimiento) === "2026-12-26", "suspender no toca la fecha de vencimiento");
  ok(bitacoras.length === 1 && bitacoras[0].accion === "cuenta_suspendida" && bitacoras[0].storeId === "L1", "y queda en la bitácora del local");
  await A.alternarSuspension("L1", false);
  ok(local.estado === "activo" && bitacoras.length === 2 && bitacoras[1].accion === "cuenta_reactivada", "reactivar vuelve a «activo» y también queda en la bitácora");

  // ---------------------------------------------------------------------------------------------- qué bloquea las ventas
  window.log("== Qué impide vender");
  ok(Susp.ventasBloqueadas("suspendido") === true, "suspendido a mano → no se registran ventas");
  ok(Susp.ventasBloqueadas("vencido") === false && Susp.ventasBloqueadas("activo") === false && Susp.ventasBloqueadas("prueba") === false && Susp.ventasBloqueadas(null) === false && Susp.ventasBloqueadas(undefined) === false, "vencido, activo, en prueba o sin dato → se vende normal");
  reiniciar({ estado: "suspendido" });
  const rechazo = await Susp.bloqueoPorSuspension("L1");
  ok(rechazo && rechazo.ok === false && /suspendida/.test(rechazo.error) && /reportes/.test(rechazo.error), "el rechazo explica que sigue pudiendo ver reportes y cerrar el turno");
  reiniciar({ estado: "vencido", vencimiento: asu("2026-01-01T00:00:00") });
  ok((await Susp.bloqueoPorSuspension("L1")) === null, "un local vencido por fecha (aunque lleve meses) no se bloquea");

  window.log("\naciertos: " + window.__aciertos + " · fallas: " + window.__fallas);
  window.__listo = true;
})().catch((e) => { document.getElementById("salida").textContent += "\nERROR: " + (e && e.stack || e); window.__listo = true; window.__fallas = (window.__fallas || 0) + 1; });
