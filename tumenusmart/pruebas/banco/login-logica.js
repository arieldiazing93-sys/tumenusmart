// El ingreso al panel (verificarIngreso de src/lib/auth.ts) con la función REAL y una base en memoria: el freno por intentos tiene que
// aguantar una ráfaga de pedidos simultáneos (el scrypt de la prueba es lento a propósito para que se crucen como en el servidor).
(async () => {
  const C = window.Cargador; const S = C.simulacros; const { ok } = window;

  await new Promise((res, rej) => { const s = document.createElement("script"); s.src = "cripto.js"; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
  window.CriptoBanco.instalar(S);
  const scrypt = window.CriptoBanco.estadoScrypt;
  window.process = { env: { SESSION_SECRET: "secreto-de-prueba-123", NODE_ENV: "test" } };

  // ------------------------------------------------------------------------------------------ la base en memoria
  class ErrorConocido extends Error { constructor(m, { code }) { super(m); this.code = code; } }
  S["@prisma/client"] = { Prisma: { PrismaClientKnownRequestError: ErrorConocido } };
  let usuarios = new Map(); let escrituras = 0;
  const cumple = (u, where) => Object.entries(where).every(([k, w]) => {
    if (k === "OR") return w.some((c) => cumple(u, c));
    if (w && typeof w === "object" && !(w instanceof Date)) {
      if ("lte" in w) return u[k] != null && u[k] <= w.lte;
      return false;
    }
    return u[k] === w;
  });
  S["src/lib/prisma"] = { prisma: { usuario: {
    findUnique: async ({ where }) => { const u = [...usuarios.values()].find((x) => (where.email ? x.email === where.email : x.id === where.id)); return u ? { ...u } : null; },
    // El `update` condicionado y atómico (cada llamada corre entera, sin cruzarse con otra): imita a la base real.
    update: async ({ where, data, select }) => {
      escrituras++;
      const u = usuarios.get(where.id);
      if (!u || !cumple(u, where)) throw new ErrorConocido("No encontrado", { code: "P2025" });
      for (const [k, v] of Object.entries(data)) { if (v && typeof v === "object" && "increment" in v) u[k] += v.increment; else u[k] = v; }
      return select ? Object.fromEntries(Object.keys(select).map((k) => [k, u[k]])) : { ...u };
    },
  } } };
  S["react"] = { cache: (f) => f };
  let bitacoras = [];
  S["src/lib/bitacora"] = { registrarBitacora: async (storeId, quien, d) => { bitacoras.push({ storeId, quien, ...d }); } };
  S["next/navigation"] = { redirect() {} }; S["next/server"] = { NextResponse: { json: (x) => x } };
  S["next/headers"] = { cookies: async () => ({ get() {}, set() {}, delete() {} }) };

  const A = await C.cargar("src/lib/auth");
  const hash = await A.cifrarPassword("Clave-correcta-1");
  const nuevoUsuario = (extra = {}) => { usuarios = new Map([["u1", { id: "u1", email: "dueno@x.com", passwordHash: hash, activo: true, rol: "local", storeId: "L1", intentosFallidos: 0, bloqueadoHasta: null, ultimoIngreso: null, ...extra }]]); scrypt.llamadas = 0; bitacoras = []; };
  const u = () => usuarios.get("u1");

  // ============================================================================================== lo de siempre
  window.log("== Ingreso normal");
  nuevoUsuario();
  let r = await A.verificarIngreso("  Dueno@X.com ", "Clave-correcta-1");
  ok(r.ok === true && r.usuarioId === "u1" && u().ultimoIngreso instanceof Date && u().intentosFallidos === 0, "con el correo (sin importar mayúsculas ni espacios) y la contraseña correcta entra");
  r = await A.verificarIngreso("dueno@x.com", "mala"); ok(r.ok === false && r.motivo === "credenciales" && u().intentosFallidos === 1, "una contraseña mala: «credenciales» y suma un intento");
  r = await A.verificarIngreso("dueno@x.com", "Clave-correcta-1"); ok(r.ok === true && u().intentosFallidos === 0, "entrar bien vuelve el conteo a cero");
  nuevoUsuario(); scrypt.llamadas = 0;
  r = await A.verificarIngreso("nadie@x.com", "lo-que-sea"); ok(r.ok === false && r.motivo === "credenciales" && scrypt.llamadas === 1, "un correo que no existe da el mismo mensaje y también gasta un cálculo (no se nota la diferencia)");
  nuevoUsuario({ activo: false }); r = await A.verificarIngreso("dueno@x.com", "Clave-correcta-1"); ok(r.ok === false && r.motivo === "credenciales", "un usuario desactivado no entra aunque la contraseña sea correcta");
  nuevoUsuario({ rol: "empleado", storeId: null }); r = await A.verificarIngreso("dueno@x.com", "Clave-correcta-1"); ok(r.ok === false, "un usuario de local sin local asignado no entra");
  nuevoUsuario({ rol: "superadmin", storeId: null }); r = await A.verificarIngreso("dueno@x.com", "Clave-correcta-1"); ok(r.ok === true, "pero un superadmin sin local sí");

  window.log("== El freno, un intento por vez");
  nuevoUsuario();
  for (let i = 1; i <= 4; i++) { r = await A.verificarIngreso("dueno@x.com", "mala" + i); ok(r.ok === false && r.motivo === "credenciales" && u().intentosFallidos === i, "error " + i + ": todavía «credenciales»"); }
  r = await A.verificarIngreso("dueno@x.com", "mala5");
  ok(r.ok === false && r.motivo === "frenado" && r.minutos === 10 && u().bloqueadoHasta > new Date() && u().intentosFallidos === 0, "el 5.º error frena 10 minutos");
  ok(bitacoras.length === 1 && bitacoras[0].accion === "ingreso_frenado" && bitacoras[0].storeId === "L1" && bitacoras[0].modulo === "seguridad" && /dueno@x.com/.test(bitacoras[0].descripcion), "y deja UNA nota en la bitácora del local para que el dueño se entere");
  scrypt.llamadas = 0;
  r = await A.verificarIngreso("dueno@x.com", "Clave-correcta-1");
  ok(r.ok === false && r.motivo === "frenado" && scrypt.llamadas === 0, "frenado, ni la contraseña CORRECTA entra y ni siquiera se calcula (" + scrypt.llamadas + " cálculos)");
  u().bloqueadoHasta = new Date(Date.now() - 1000);
  r = await A.verificarIngreso("dueno@x.com", "Clave-correcta-1");
  ok(r.ok === true && u().intentosFallidos === 0, "cuando pasa el freno, vuelve a entrar con la contraseña correcta");
  nuevoUsuario(); for (let i = 0; i < 3; i++) await A.verificarIngreso("dueno@x.com", "mala");
  r = await A.verificarIngreso("dueno@x.com", "Clave-correcta-1"); ok(r.ok === true && u().intentosFallidos === 0, "tres errores y después la correcta: entra y los errores se olvidan");
  nuevoUsuario(); for (let i = 0; i < 4; i++) await A.verificarIngreso("dueno@x.com", "mala");
  r = await A.verificarIngreso("dueno@x.com", "Clave-correcta-1"); ok(r.ok === true, "con 4 errores, la correcta en el 5.º intento todavía entra");

  // ============================================================================================== la ráfaga
  window.log("== Una ráfaga de pedidos a la vez");
  for (const cuantos of [20, 100, 400]) {
    nuevoUsuario();
    const resultados = await Promise.all(Array.from({ length: cuantos }, (_, i) => A.verificarIngreso("dueno@x.com", "intento-" + i)));
    const frenados = resultados.filter((x) => x.motivo === "frenado").length;
    ok(scrypt.llamadas <= 5, cuantos + " pedidos simultáneos con contraseñas malas: solo " + scrypt.llamadas + " llegaron a probar una contraseña (tope 5)");
    ok(frenados >= cuantos - 5 && u().bloqueadoHasta > new Date(), "el resto (" + frenados + ") quedó frenado y el usuario quedó bloqueado");
    ok(bitacoras.length >= 1 && bitacoras.length <= 2, "y la ráfaga de " + cuantos + " deja 1 o 2 notas en la bitácora, no cientos (" + bitacoras.length + ")");
  }
  // Una ráfaga con la contraseña correcta escondida: nunca más de 5 pruebas en total.
  nuevoUsuario();
  const mezcla = await Promise.all(Array.from({ length: 200 }, (_, i) => A.verificarIngreso("dueno@x.com", i === 150 ? "Clave-correcta-1" : "mala-" + i)));
  ok(scrypt.llamadas <= 5, "200 pedidos con la correcta escondida entre las malas: " + scrypt.llamadas + " pruebas en total (tope 5)");
  // Dos rondas separadas por el freno: cada una prueba como mucho 5.
  nuevoUsuario();
  await Promise.all(Array.from({ length: 50 }, (_, i) => A.verificarIngreso("dueno@x.com", "x" + i)));
  const despues = scrypt.llamadas; await Promise.all(Array.from({ length: 50 }, (_, i) => A.verificarIngreso("dueno@x.com", "y" + i)));
  ok(scrypt.llamadas === despues, "mientras dura el freno, una segunda ráfaga no prueba NINGUNA contraseña más");

  window.log("\naciertos: " + window.__aciertos + " · fallas: " + window.__fallas);
  window.__listo = true;
})().catch((e) => { document.getElementById("salida").textContent += "\nERROR: " + (e && e.stack || e); window.__listo = true; window.__fallas = (window.__fallas || 0) + 1; });
