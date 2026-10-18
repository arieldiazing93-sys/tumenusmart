// Cobrar una venta a crédito (registrarCobroVenta) con la acción REAL: dos cobros a la vez no pueden pasarse de lo que el cliente debe, ni
// duplicar el ingreso en la caja. El `$transaction` de la prueba hace fila (como el bloqueo de la fila en la base real).
(async () => {
  const C = window.Cargador; const S = C.simulacros; const { ok } = window;

  let venta, cobros, movimientos, bitacoras, turno, cola;
  const reiniciar = (total = 100000) => {
    venta = { id: "v1", numero: 9, total, formaPago: "a_credito", cancelada: false, clienteNombre: "Ana", facturaRazonSocial: null };
    cobros = []; movimientos = []; bitacoras = []; turno = { id: "t1" }; cola = Promise.resolve();
  };
  const tx = {
    ventaPos: { updateMany: async ({ where }) => ({ count: venta.id === where.id && venta.cancelada === where.cancelada ? 1 : 0 }) },
    cobroVenta: {
      aggregate: async () => ({ _sum: { monto: cobros.reduce((s, c) => s + c.monto, 0) } }),
      create: async ({ data }) => { await new Promise((r) => setTimeout(r, 2)); const c = { id: "c" + (cobros.length + 1), ...data }; cobros.push(c); return { id: c.id }; },
    },
    movimientoCaja: { create: async ({ data }) => { movimientos.push(data); return {}; } },
  };
  const db = {
    ventaPos: { findUnique: async () => ({ ...venta, cobros: cobros.map((c) => ({ monto: c.monto })) }) },
    // Las transacciones hacen fila: cada una empieza cuando termina la anterior (el bloqueo de la fila hace lo mismo en la base real).
    $transaction: (cb) => { const mia = cola.then(() => cb(tx)); cola = mia.catch(() => {}); return mia; },
  };
  S["next/cache"] = { revalidatePath() {} };
  S["src/lib/auth"] = { exigirPermiso: async () => ({ nombre: "Caja", email: "caja@x.com", rol: "empleado" }) };
  S["src/lib/local-actual"] = { idLocalActual: async () => "L1" };
  S["src/lib/prisma-local"] = { prismaDelLocal: () => db };
  S["src/lib/estacion-actual"] = { estacionActual: async () => ({ id: "e1" }) };
  S["src/lib/bitacora"] = { registrarBitacora: async (_l, _s, d) => { bitacoras.push(d); } };
  S["src/app/admin/(protected)/pos/turno-actual"] = { turnoAbierto: async () => turno };
  const A = await C.cargar("src/app/admin/(protected)/pos/cuentas-por-cobrar/actions");

  const cobrar = (monto, extra = {}) => A.registrarCobroVenta("v1", { monto, fecha: "2026-10-17", formaPago: "efectivo", notas: null, ...extra });
  const totalCobrado = () => cobros.reduce((s, c) => s + c.monto, 0);

  window.log("== Un cobro por vez");
  reiniciar();
  let r = await cobrar(40000);
  ok(r.ok === true && cobros.length === 1 && movimientos.length === 1 && movimientos[0].monto === 40000 && movimientos[0].tipo === "ingreso" && movimientos[0].cobroVentaId === cobros[0].id, "un cobro en efectivo de 40.000 queda anotado y entra a la caja como ingreso ligado a ese cobro");
  r = await cobrar(60000); ok(r.ok === true && totalCobrado() === 100000, "el resto (60.000) también entra, y la venta queda cobrada por completo");
  r = await cobrar(1); ok(r.ok === false && /ya está cobrada/.test(r.error) && cobros.length === 2, "después de cobrada por completo no acepta más → " + (r.ok ? "" : r.error));
  reiniciar(); r = await cobrar(100001); ok(r.ok === false && /supera/.test(r.error) && cobros.length === 0, "un cobro mayor a lo que falta se rechaza");
  r = await cobrar(0); ok(r.ok === false, "un cobro en cero se rechaza"); r = await cobrar(-5); ok(r.ok === false, "uno negativo también"); r = await cobrar(NaN); ok(r.ok === false, "y uno que no es número");
  r = await cobrar(1000, { formaPago: "bitcoin" }); ok(r.ok === false && cobros.length === 0, "una forma de pago inventada se rechaza");
  r = await cobrar(1000, { formaPago: "transferencia" }); ok(r.ok === true && movimientos.length === 0, "una transferencia no pasa por la caja (no genera ingreso)");
  reiniciar(); turno = null; r = await cobrar(1000); ok(r.ok === false && r.sinTurno === true && cobros.length === 0, "en efectivo, sin turno abierto, manda a abrir el turno y no cobra");
  reiniciar(); venta.cancelada = true; r = await cobrar(1000); ok(r.ok === false && /cancelada/.test(r.error), "una venta cancelada no recibe cobros");
  reiniciar(); venta.formaPago = "efectivo"; r = await cobrar(1000); ok(r.ok === false && /no es a crédito/.test(r.error), "una venta que no es a crédito no recibe cobros");

  window.log("== Dos cobros a la vez (doble toque, dos pestañas)");
  reiniciar();
  let par = await Promise.all([cobrar(100000), cobrar(100000)]);
  ok(par.filter((x) => x.ok).length === 1 && totalCobrado() === 100000 && movimientos.length === 1, "dos cobros por TODO el saldo a la vez: solo uno entra (cobrado " + totalCobrado() + ", " + movimientos.length + " ingreso a la caja)");
  ok(par.find((x) => !x.ok)?.error && /ya está cobrada|supera/.test(par.find((x) => !x.ok).error), "y el otro recibe el motivo → " + par.find((x) => !x.ok)?.error);
  reiniciar();
  par = await Promise.all([cobrar(70000), cobrar(70000)]);
  ok(par.filter((x) => x.ok).length === 1 && totalCobrado() === 70000, "dos de 70.000 sobre 100.000: entra uno, el segundo ve que solo faltan 30.000");
  reiniciar();
  par = await Promise.all([cobrar(30000), cobrar(30000), cobrar(30000), cobrar(30000)]);
  ok(par.filter((x) => x.ok).length === 3 && totalCobrado() === 90000, "cuatro de 30.000: entran tres (90.000) y el cuarto queda afuera por 10.000 que faltan");
  reiniciar();
  const muchos = await Promise.all(Array.from({ length: 40 }, () => cobrar(7000)));
  ok(totalCobrado() <= 100000 && muchos.filter((x) => x.ok).length === 14, "40 cobros de 7.000 a la vez: nunca se pasa de 100.000 (entraron " + muchos.filter((x) => x.ok).length + ", total " + totalCobrado() + ")");
  ok(movimientos.length === cobros.length && movimientos.every((m, i) => m.monto === cobros[i].monto), "y cada cobro tiene exactamente un ingreso a la caja");
  reiniciar();
  const ultimo = await Promise.all([cobrar(50000), cobrar(50000), cobrar(1)]);
  ok(totalCobrado() <= 100000, "cobros que suman más que la deuda, todos juntos: el total cobrado no supera 100.000 (" + totalCobrado() + ")");

  window.log("\naciertos: " + window.__aciertos + " · fallas: " + window.__fallas);
  window.__listo = true;
})().catch((e) => { document.getElementById("salida").textContent += "\nERROR: " + (e && e.stack || e); window.__listo = true; window.__fallas = (window.__fallas || 0) + 1; });
