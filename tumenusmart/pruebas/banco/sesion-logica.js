// La sesión del panel (abrirSesion / sesionActual de src/lib/auth.ts y el middleware de Edge) con el código REAL: la cookie va atada a la
// contraseña actual, así que cambiarla o restablecerla cierra todas las sesiones abiertas con la anterior.
(async () => {
  const C = window.Cargador; const S = C.simulacros; const { ok } = window;

  await new Promise((res, rej) => { const s = document.createElement("script"); s.src = "cripto.js"; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
  window.CriptoBanco.instalar(S);
  const cripto = window.CriptoBanco.cripto;
  const SECRETO = "secreto-de-prueba-123";
  window.process = { env: { SESSION_SECRET: SECRETO, NODE_ENV: "test" } };
  const firmaDe = (texto, secreto = SECRETO) => cripto.createHmac("sha256", secreto).update(texto).digest("hex");

  // ------------------------------------------------------------------------------------------ simulacros
  class ErrorConocido extends Error { constructor(m, { code }) { super(m); this.code = code; } }
  S["@prisma/client"] = { Prisma: { PrismaClientKnownRequestError: ErrorConocido } };
  let usuarios = new Map();
  S["src/lib/prisma"] = { prisma: { usuario: {
    findUnique: async ({ where }) => { const u = [...usuarios.values()].find((x) => (where.email ? x.email === where.email : x.id === where.id)); return u ? { ...u } : null; },
    update: async ({ where, data }) => { const u = usuarios.get(where.id); Object.assign(u, data); return { ...u }; },
  } } };
  const galletas = new Map(); let ultimasOpciones = null;
  S["next/headers"] = { cookies: async () => ({
    get: (n) => (galletas.has(n) ? { value: galletas.get(n) } : undefined),
    set: (n, v, o) => { if (o && o.maxAge === 0) galletas.delete(n); else galletas.set(n, v); ultimasOpciones = o; },
    delete: (n) => { galletas.delete(n); },
  }) };
  S["react"] = { cache: (f) => f };
  S["next/navigation"] = { redirect() {} };
  S["next/cache"] = { revalidatePath() {} };
  S["next/server"] = { NextRequest: class {}, NextResponse: {
    json: (x) => x,
    redirect: (u) => ({ tipo: "redirect", url: String(u) }),
    next: () => { const r = { tipo: "next", puestas: [], cookies: { set: (n, v, o) => r.puestas.push({ n, v, o }) } }; return r; },
  } };

  const A = await C.cargar("src/lib/auth");
  const M = await C.cargar("middleware");
  const hashViejo = await A.cifrarPassword("Clave-vieja-1");
  const hashOtro = await A.cifrarPassword("Clave-de-otro-2");
  const reiniciar = () => {
    galletas.clear();
    usuarios = new Map([
      ["u1", { id: "u1", email: "dueno@x.com", nombre: "Dueño", rol: "local", storeId: "L1", activo: true, debeCambiarPassword: false, passwordHash: hashViejo }],
      ["u2", { id: "u2", email: "caja@x.com", nombre: "Caja", rol: "empleado", storeId: "L1", activo: true, debeCambiarPassword: false, passwordHash: hashOtro }],
    ]);
  };
  const COOKIE = "admin_session";
  const pedido = (ruta, valor) => ({ nextUrl: { pathname: ruta }, cookies: { get: (n) => (n === COOKIE && valor != null ? { value: valor } : undefined) }, url: "http://localhost:3000" + ruta });

  // ============================================================================================== la cookie
  window.log("== Abrir la sesión");
  reiniciar();
  await A.abrirSesion("u1");
  const cookie = galletas.get(COOKIE);
  ok(/^u1\.[0-9a-f]{32}\.[0-9a-f]{64}$/.test(cookie), "la cookie es <id>.<huella de 32>.<firma de 64> → " + cookie.slice(0, 20) + "…");
  ok(ultimasOpciones.httpOnly === true && ultimasOpciones.sameSite === "lax" && ultimasOpciones.path === "/", "solo del servidor (httpOnly), sameSite lax, para todo el sitio");
  ok(!cookie.includes(hashViejo.split(":")[2].slice(0, 20)), "no lleva la contraseña ni su hash a la vista");
  let s = await A.sesionActual();
  ok(s && s.id === "u1" && s.email === "dueno@x.com" && s.rol === "local" && s.storeId === "L1", "con esa cookie, sesionActual devuelve al usuario");
  ok(!("passwordHash" in s), "y NO devuelve el hash de la contraseña");

  window.log("== Cambiar la contraseña cierra las sesiones");
  const cookieVieja = cookie;
  usuarios.get("u1").passwordHash = await A.cifrarPassword("Clave-nueva-9");
  ok((await A.sesionActual()) === null, "cambiada la contraseña, la cookie de antes deja de valer");
  galletas.set(COOKIE, cookieVieja);
  ok((await A.sesionActual()) === null, "y volver a ponerla a mano tampoco sirve");
  await A.abrirSesion("u1");
  ok((await A.sesionActual())?.id === "u1", "una sesión abierta DESPUÉS del cambio sí vale");
  galletas.set(COOKIE, cookieVieja);
  ok((await A.sesionActual()) === null, "y la anterior sigue sin servir");

  window.log("== Cookies falsas o viejas");
  reiniciar(); await A.abrirSesion("u1"); const buena = galletas.get(COOKIE); const [id, huella, firma] = buena.split(".");
  const probar = async (valor) => { if (valor == null) galletas.delete(COOKIE); else galletas.set(COOKIE, valor); return A.sesionActual(); };
  ok((await probar(null)) === null, "sin cookie no hay sesión");
  for (const raro of ["", ".", "..", "a.b", "u1..", ".x", "u1.", "u1.huella", "u1.huella.firma", "x".repeat(500)]) ok((await probar(raro)) === null, "un valor raro (" + JSON.stringify(raro.slice(0, 18)) + ") no da sesión ni rompe nada");
  ok((await probar(id + "." + firmaDe(id))) === null, "una cookie del formato anterior (id + firma del id, que SÍ está bien firmada) ya no sirve: hay que volver a entrar una vez");
  ok((await probar("u2." + huella + "." + firma)) === null, "cambiar el id por el de otro usuario (firma ajena) no sirve");
  ok((await probar(id + "." + huella.replace(/./, (c) => (c === "0" ? "1" : "0")) + "." + firma)) === null, "tocar una letra de la huella rompe la firma");
  ok((await probar(id + "." + huella + "." + firma.slice(0, 63) + (firma.endsWith("0") ? "1" : "0"))) === null, "tocar una letra de la firma no sirve");
  const base2 = "u1." + huella; ok((await probar(base2 + "." + firmaDe(base2, "otra-clave"))) === null, "una firma hecha con otra clave no sirve");
  // Alguien arma la cookie de u1 con la huella de OTRA contraseña (pero firmada de verdad, como si tuviera la clave del servidor): igual no vale.
  const huellaAjena = (() => { const h = cripto.createHmac("sha256", SECRETO).update("sesion-clave:" + hashOtro).digest("hex").slice(0, 32); return h; })();
  const baseAjena = "u1." + huellaAjena; ok((await probar(baseAjena + "." + firmaDe(baseAjena))) === null, "ni siquiera bien firmada vale con la huella de otra contraseña");
  ok((await probar(buena))?.id === "u1", "la cookie buena sigue sirviendo");

  window.log("== El usuario cambia o se apaga");
  usuarios.get("u1").activo = false; ok((await probar(buena)) === null, "un usuario desactivado pierde la sesión en el acto");
  usuarios.get("u1").activo = true; usuarios.get("u1").storeId = null; ok((await probar(buena)) === null, "un usuario de local sin local asignado no tiene sesión");
  usuarios.get("u1").rol = "superadmin"; ok((await probar(buena))?.rol === "superadmin", "pero un superadmin sin local sí");
  usuarios.get("u1").rol = "local"; usuarios.get("u1").storeId = "L1"; usuarios.get("u1").rol = "empleado"; ok((await probar(buena))?.rol === "empleado", "un cambio de rol se ve en el próximo pedido (el rol no viaja en la cookie)");
  usuarios.get("u1").rol = "local";
  usuarios.delete("u1"); ok((await probar(buena)) === null, "un usuario borrado pierde la sesión");
  let fallo = false; try { await A.abrirSesion("no-existe"); } catch { fallo = true; } ok(fallo, "no se puede abrir la sesión de alguien que no existe");

  window.log("== Cambiar la clave del servidor");
  reiniciar(); await A.abrirSesion("u1"); const conSecreto = galletas.get(COOKIE);
  window.process.env.SESSION_SECRET = "otra-clave-456"; ok((await probar(conSecreto)) === null, "si cambia SESSION_SECRET, todas las sesiones se cierran");
  window.process.env.SESSION_SECRET = SECRETO; ok((await probar(conSecreto))?.id === "u1", "y con la de siempre vuelven");

  // ============================================================================================== el cambio de contraseña desde Mi cuenta
  window.log("== Mi cuenta → cambiar mi contraseña");
  reiniciar(); await A.abrirSesion("u1"); const cookieAntes = galletas.get(COOKIE);
  const MC = await C.cargar("src/app/admin/(protected)/mi-cuenta/actions");
  const datos = (o) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
  let r = await MC.cambiarMiPassword(datos({ actual: "mala", nueva: "Clave-nueva-9", repetida: "Clave-nueva-9" }));
  ok(r.ok === false && galletas.get(COOKIE) === cookieAntes, "con la contraseña actual mal escrita no cambia nada y la sesión sigue igual");
  const hashAntes = usuarios.get("u1").passwordHash;
  r = await MC.cambiarMiPassword(datos({ actual: "Clave-vieja-1", nueva: "Clave-nueva-9", repetida: "Clave-nueva-9" }));
  ok(r.ok === true && usuarios.get("u1").passwordHash !== hashAntes && usuarios.get("u1").debeCambiarPassword === false, "con la actual bien escrita cambia la contraseña");
  ok(galletas.get(COOKIE) !== cookieAntes && (await A.sesionActual())?.id === "u1", "y ESTA computadora sigue con sesión (se le abrió una nueva)");
  galletas.set(COOKIE, cookieAntes); ok((await A.sesionActual()) === null, "pero la sesión que se había abierto antes —en otro celular o con una cookie robada— quedó cerrada");

  // ============================================================================================== el middleware (Edge)
  window.log("== El middleware sigue dejando pasar la cookie nueva");
  reiniciar(); await A.abrirSesion("u1"); const nueva = galletas.get(COOKIE);
  let m = await M.middleware(pedido("/admin/pos", nueva));
  ok(m.tipo === "next" && m.puestas.length === 1 && m.puestas[0].v === nueva && m.puestas[0].o.maxAge === 7 * 86400, "con la cookie nueva bien firmada pasa y la renueva 7 días (sin cambiarle el valor)");
  m = await M.middleware(pedido("/admin/pos", nueva.slice(0, -1) + (nueva.endsWith("0") ? "1" : "0")));
  ok(m.tipo === "redirect" && /\/admin\/login$/.test(m.url), "con la firma alterada lo manda al ingreso");
  m = await M.middleware(pedido("/admin/pos", null)); ok(m.tipo === "redirect", "sin cookie lo manda al ingreso");
  m = await M.middleware(pedido("/admin/login", null)); ok(m.tipo === "next", "el ingreso en sí queda abierto");
  m = await M.middleware(pedido("/admin/pos", "u2." + nueva.split(".")[1] + "." + nueva.split(".")[2])); ok(m.tipo === "redirect", "con el id cambiado lo manda al ingreso");
  const viejaBienFirmada = "u1." + firmaDe("u1");
  m = await M.middleware(pedido("/admin/pos", viejaBienFirmada));
  galletas.set(COOKIE, viejaBienFirmada);
  ok(m.tipo === "next" && (await A.sesionActual()) === null, "una cookie del formato anterior pasa el middleware (solo mira la firma) pero sesionActual la rechaza: la pantalla manda a entrar");

  window.log("\naciertos: " + window.__aciertos + " · fallas: " + window.__fallas);
  window.__listo = true;
})().catch((e) => { document.getElementById("salida").textContent += "\nERROR: " + (e && e.stack || e); window.__listo = true; window.__fallas = (window.__fallas || 0) + 1; });
