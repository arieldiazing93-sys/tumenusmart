// La contraseña del dueño, del administrador y del cajero (5 caracteres de cualquier tipo) y la autorización en la caja con las funciones REALES:
// la regla por rol (el superadmin sigue con la estricta), y que si dos personas eligen la misma contraseña no se autorice a «uno cualquiera»
// (la Bitácora tiene que decir quién fue de verdad).
(async () => {
  const C = window.Cargador; const S = C.simulacros; const { ok } = window;

  await new Promise((res, rej) => { const s = document.createElement("script"); s.src = "cripto.js"; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
  window.CriptoBanco.instalar(S);
  const scrypt = window.CriptoBanco.estadoScrypt;
  window.process = { env: { SESSION_SECRET: "secreto-de-prueba-123", NODE_ENV: "test" } };

  // ------------------------------------------------------------------------------------------ simulacros
  class ErrorConocido extends Error { constructor(m, { code }) { super(m); this.code = code; } }
  S["@prisma/client"] = { Prisma: { PrismaClientKnownRequestError: ErrorConocido } };
  let usuarios = []; let local = { seguridadEventos: ["cancelar_productos"], seguridadPermisosCaja: ["cancelar_productos"] };
  let creados = 0;
  S["src/lib/prisma"] = { prisma: {
    store: { findUnique: async () => ({ ...local }) },
    usuario: {
      findMany: async ({ where }) => usuarios.filter((u) => u.storeId === where.storeId && (!("activo" in where) || u.activo === where.activo) && where.rol.in.includes(u.rol) && (!where.id || u.id !== where.id.not)).map((u) => ({ ...u })),
      findUnique: async ({ where }) => { const u = usuarios.find((x) => (where.email ? x.email === where.email : x.id === where.id)); return u ? { ...u } : null; },
      update: async ({ where, data }) => { const u = usuarios.find((x) => x.id === where.id); Object.assign(u, data); return { ...u }; },
      create: async ({ data }) => { creados++; usuarios.push({ id: "nuevo" + creados, activo: true, ...data }); return { id: "nuevo" + creados }; },
    },
    bitacora: { count: async ({ where }) => bitacoras.filter((b) => b.storeId === where.storeId && b.quien.email === where.usuarioEmail && where.accion.in.includes(b.accion) && b.creadoEn >= where.createdAt.gte).length },
  } };
  let bitacoras = []; let intentos = [];
  S["src/lib/bitacora"] = { registrarBitacora: async (storeId, quien, d) => { bitacoras.push({ storeId, quien, creadoEn: new Date(), ...d }); } };
  let n = 0;
  S["src/lib/limite-pin"] = {
    pedirIntentoDePin: async () => ({ ok: true, n: ++n }),
    resolverIntentoDePin: async (_e, _s, acerto) => { intentos.push(acerto); return acerto ? { bloqueado: false, quedan: 5 } : { bloqueado: false, quedan: 4 }; },
  };
  S["react"] = { cache: (f) => f };
  S["next/navigation"] = { redirect() {} }; S["next/server"] = { NextResponse: { json: (x) => x } };
  S["next/headers"] = { cookies: async () => ({ get() {}, set() {}, delete() {} }) };

  const A = await C.cargar("src/lib/auth");
  const R = await C.cargar("src/lib/reglas-clave");
  const SS = await C.cargar("src/lib/seguridad-servidor");
  const SEG = await C.cargar("src/lib/seguridad");

  // ============================================================================================== la regla por rol
  window.log("== La regla de la contraseña nueva, según quién es");
  for (const rol of ["local", "empleado"]) {
    for (const buena of ["12345", "abcde", "ABCDE", "AbCdE", "a1B2c", "123456789", "con espacio", "ñandú"]) {
      ok(A.revisarPasswordNueva(buena, rol) === null, rol + ": «" + buena + "» sirve (5 caracteres o más, de cualquier tipo)");
    }
    for (const mala of ["1234", "abcd", "", "x", "     ", "          "]) {
      ok(typeof A.revisarPasswordNueva(mala, rol) === "string", rol + ": «" + mala + "» no sirve (menos de 5 o solo espacios)");
    }
    ok(A.revisarPasswordNueva("1234", rol) === "La contraseña tiene que tener al menos 5 caracteres", rol + ": con 4 dice «al menos 5 caracteres»");
    ok(A.revisarPasswordNueva("a".repeat(200), rol) === null && A.revisarPasswordNueva("a".repeat(201), rol) === "La contraseña es demasiado larga", rol + ": el máximo sigue siendo 200");
  }
  for (const rol of ["superadmin", undefined, null, "", "otro"]) {
    ok(A.revisarPasswordNueva("12345", rol) !== null && A.revisarPasswordNueva("abcde", rol) !== null, String(rol) + ": 5 caracteres NO alcanzan (el superadmin y lo desconocido siguen con la estricta)");
    ok(A.revisarPasswordNueva("abcdefg1", rol) === null, String(rol) + ": 8 con letras y números sí sirve");
    ok(A.revisarPasswordNueva("abcdefgh", rol) === "La contraseña tiene que incluir algún número" && A.revisarPasswordNueva("12345678", rol) === "La contraseña tiene que incluir alguna letra", String(rol) + ": sin número o sin letra no sirve");
  }
  ok(R.requisitosDeClave("empleado").includes("5 caracteres") && R.requisitosDeClave("local").includes("5 caracteres") && R.requisitosDeClave("superadmin").includes("8 caracteres"), "el aviso de la pantalla dice 5 para el dueño y el cajero, y 8 para el superadmin");

  // ============================================================================================== la autorización en la caja
  window.log("== Autorizar con una contraseña corta");
  const hash = (p) => A.cifrarPassword(p);
  const persona = async (id, nombre, rol, pass, extra = {}) => ({ id, nombre, email: id + "@x.com", rol, perfilSeguridad: rol === "empleado" ? "caja" : null, passwordHash: await hash(pass), activo: true, storeId: "L1", ...extra });
  const quien = { nombre: "Cajera", email: "cajera@x.com", rol: "empleado" };
  const reiniciar = () => { bitacoras = []; intentos = []; n = 0; };

  usuarios = [
    await persona("dueno", "Dueño", "local", "Dueno-2026"),
    await persona("ana", "Ana", "empleado", "12345"),
    await persona("pedro", "Pedro", "empleado", "abcde"),
  ];
  reiniciar();
  let r = await SS.exigirAutorizacion("L1", quien, "cancelar_productos", "12345");
  ok(r.ok === true && r.autorizo === "Ana", "«12345» (solo números, 5 dígitos) autoriza y la Bitácora dice que fue Ana → " + JSON.stringify(r));
  ok(bitacoras.length === 1 && bitacoras[0].accion === "autorizacion_concedida" && bitacoras[0].detalle.autorizoId === "ana" && /Ana/.test(bitacoras[0].descripcion), "queda UNA nota «autorizacion_concedida» a nombre de Ana");
  r = await SS.exigirAutorizacion("L1", quien, "cancelar_productos", "abcde");
  ok(r.ok === true && r.autorizo === "Pedro", "«abcde» (solo letras minúsculas) autoriza a Pedro");
  r = await SS.exigirAutorizacion("L1", quien, "cancelar_productos", "ABCDE");
  ok(r.ok === false && r.requiereClave === true, "«ABCDE» no es la de nadie (distingue mayúsculas): no autoriza");
  r = await SS.exigirAutorizacion("L1", quien, "cancelar_productos", "Dueno-2026");
  ok(r.ok === true && r.autorizo === "Dueño", "la contraseña larga del dueño sigue funcionando");

  window.log("== Dos personas con la misma contraseña");
  usuarios = [
    await persona("dueno", "Dueño", "local", "Dueno-2026"),
    await persona("ana", "Ana", "empleado", "12345"),
    await persona("luis", "Luis", "empleado", "12345"),
    await persona("pedro", "Pedro", "empleado", "abcde"),
  ];
  reiniciar();
  r = await SS.exigirAutorizacion("L1", quien, "cancelar_productos", "12345");
  ok(r.ok === false && r.requiereClave === true && r.error === SEG.TEXTOS_AUTORIZACION.compartida, "si Ana y Luis tienen «12345» NO se autoriza a ninguno de los dos → " + JSON.stringify(r));
  ok(bitacoras.length === 1 && bitacoras[0].accion === "autorizacion_compartida" && /Ana/.test(bitacoras[0].descripcion) && /Luis/.test(bitacoras[0].descripcion), "y la Bitácora avisa quiénes comparten la contraseña, para que el dueño lo arregle → " + (bitacoras[0] && bitacoras[0].descripcion));
  ok(!bitacoras.some((b) => b.accion === "autorizacion_concedida"), "no queda ninguna autorización concedida a nombre de uno al azar");
  ok(intentos.length === 1 && intentos[0] === true, "no es una adivinanza (la contraseña es verdadera): el intento se devuelve como en un acierto");
  r = await SS.exigirAutorizacion("L1", quien, "cancelar_productos", "abcde");
  ok(r.ok === true && r.autorizo === "Pedro", "mientras tanto, las demás contraseñas siguen autorizando normalmente");

  // Si uno de los dos no puede autorizar ESTE evento, no hay confusión posible: autoriza el que sí puede.
  local = { seguridadEventos: ["cancelar_productos"], seguridadPermisosCaja: [] };
  usuarios = [await persona("dueno", "Dueño", "local", "12345"), await persona("ana", "Ana", "empleado", "12345")];
  reiniciar();
  r = await SS.exigirAutorizacion("L1", quien, "cancelar_productos", "12345");
  ok(r.ok === true && r.autorizo === "Dueño", "si Caja no puede autorizar este evento, la contraseña repetida de Ana no confunde: autoriza el dueño");
  local = { seguridadEventos: ["cancelar_productos"], seguridadPermisosCaja: ["cancelar_productos"] };

  usuarios = [await persona("dueno", "Dueño", "local", "12345"), await persona("ana", "Ana", "empleado", "12345", { activo: false })];
  reiniciar();
  r = await SS.exigirAutorizacion("L1", quien, "cancelar_productos", "12345");
  ok(r.ok === true && r.autorizo === "Dueño", "una persona desactivada con la misma contraseña tampoco confunde");
  usuarios = [await persona("dueno", "Dueño", "local", "12345"), await persona("otro", "De otro local", "empleado", "12345", { storeId: "L2" })];
  reiniciar();
  r = await SS.exigirAutorizacion("L1", quien, "cancelar_productos", "12345");
  ok(r.ok === true && r.autorizo === "Dueño", "ni la de otro local (cada local ve solo a su gente)");

  window.log("== Lo de siempre sigue igual");
  usuarios = [await persona("dueno", "Dueño", "local", "Dueno-2026"), await persona("ana", "Ana", "empleado", "12345")];
  reiniciar();
  r = await SS.exigirAutorizacion("L1", quien, "cancelar_productos", "99999");
  ok(r.ok === false && r.requiereClave === true && intentos.length === 1 && intentos[0] === false && bitacoras[0].accion === "autorizacion_fallida", "una contraseña equivocada falla, gasta el intento y queda en la Bitácora");
  r = await SS.exigirAutorizacion("L1", quien, "cancelar_productos", "");
  ok(r.ok === false && r.requiereClave === true, "sin escribir nada pide la contraseña");
  scrypt.llamadas = 0;
  r = await SS.exigirAutorizacion("L1", quien, "cancelar_productos", "x".repeat(201));
  ok(r.ok === false && scrypt.llamadas === 0, "una de más de 200 caracteres ni se prueba");
  r = await SS.exigirAutorizacion("L1", quien, "descuentos", "lo-que-sea");
  ok(r.ok === true && r.autorizo === null, "un evento que el local no protegió no pide nada");

  // ============================================================================================== que no se repita (Mi cuenta)
  window.log("== Mi cuenta: la contraseña no puede ser la de otra persona del local");
  let sesion = null; let abiertas = [];
  S["src/lib/auth"] = { ...A, sesionObligatoria: async () => sesion, exigirSuperadmin: async () => ({ id: "sa", email: "sa@x.com", rol: "superadmin", storeId: null }), abrirSesion: async (id) => { abiertas.push(id); } };
  S["next/cache"] = { revalidatePath() {} };
  const MC = await C.cargar("src/app/admin/(protected)/mi-cuenta/actions");
  const US = await C.cargar("src/app/admin/(protected)/usuarios/actions");
  const CU = await C.cargar("src/lib/clave-unica");
  const form = (o) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
  const mundo = async () => {
    usuarios = [
      await persona("dueno", "Dueño", "local", "Dueno-2026"),
      await persona("ana", "Ana", "empleado", "12345"),
      await persona("luis", "Luis", "empleado", "luis-clave"),
      await persona("ex", "Ex empleada", "empleado", "55555", { activo: false }),
      await persona("otro", "De otro local", "empleado", "99999", { storeId: "L2" }),
      await persona("sa", "Super", "superadmin", "Super-1234", { storeId: null }),
    ];
    bitacoras = []; abiertas = [];
  };
  const U = (id) => usuarios.find((x) => x.id === id);
  const cambiar = (actual, nueva) => MC.cambiarMiPassword(form({ actual, nueva, repetida: nueva }));
  const comoLuis = () => { sesion = { id: "luis", email: "luis@x.com", nombre: "Luis", rol: "empleado", storeId: "L1" }; };

  await mundo(); comoLuis();
  let hashLuis = U("luis").passwordHash;
  r = await cambiar("luis-clave", "12345");
  ok(r.ok === false && r.error === CU.ERROR_CLAVE_REPETIDA && /ya existe/.test(r.error) && U("luis").passwordHash === hashLuis && abiertas.length === 0, "«12345» ya la tiene Ana: dice «Esa contraseña ya existe», no cambia nada y no abre sesión → " + r.error);
  ok(bitacoras.length === 1 && bitacoras[0].accion === "contrasena_repetida" && !/12345/.test(bitacoras[0].descripcion), "queda en la Bitácora el intento (sin escribir cuál contraseña ni de quién)");
  r = await cambiar("luis-clave", "Dueno-2026");
  ok(r.ok === false && r.error === CU.ERROR_CLAVE_REPETIDA, "la del dueño tampoco se puede usar");
  r = await cambiar("luis-clave", "55555");
  ok(r.ok === false && r.error === CU.ERROR_CLAVE_REPETIDA, "ni la de una persona desactivada (si la reactivan, chocarían)");
  r = await cambiar("luis-clave", "99999");
  ok(r.ok === true && U("luis").passwordHash !== hashLuis && abiertas.join() === "luis", "la de OTRO local no cuenta: se puede usar → " + JSON.stringify(r));
  ok(bitacoras.some((b) => b.accion === "contrasena_cambiada" && b.storeId === "L1"), "y el cambio queda en la Bitácora");
  r = await cambiar("99999", "99999");
  ok(r.ok === false && /igual a la actual/.test(r.error), "volver a poner la misma que ya tiene sigue diciendo «igual a la actual» (no «ya existe»)");
  bitacoras.forEach((b) => { b.creadoEn = new Date(Date.now() - 11 * 60000); }); // pasó un rato: el freno de más abajo no entra en estas
  r = await cambiar("99999", "abcde");
  ok(r.ok === true, "5 letras minúsculas sirven");
  r = await cambiar("abcde", "ABCDE");
  ok(r.ok === true, "5 letras mayúsculas sirven (distinguen de las minúsculas)");

  window.log("== El freno para no ir probando contraseñas");
  await mundo(); comoLuis();
  for (let i = 0; i < 5; i++) { r = await cambiar("luis-clave", "12345"); ok(r.ok === false && r.error === CU.ERROR_CLAVE_REPETIDA, "intento " + (i + 1) + ": «ya existe»"); }
  hashLuis = U("luis").passwordHash;
  r = await cambiar("luis-clave", "contraseña-libre-1");
  ok(r.ok === false && r.error === CU.ERROR_DEMASIADAS_PRUEBAS && U("luis").passwordHash === hashLuis, "el 6.º intento seguido se frena aunque la contraseña sea libre → " + r.error);
  r = await cambiar("luis-clave", "12345");
  ok(r.ok === false && r.error === CU.ERROR_DEMASIADAS_PRUEBAS, "y frenado ya no confirma si «12345» existe o no (misma respuesta para cualquiera)");
  bitacoras.forEach((b) => { b.creadoEn = new Date(Date.now() - 11 * 60000); });
  r = await cambiar("luis-clave", "contraseña-libre-1");
  ok(r.ok === true, "pasados los 10 minutos puede cambiarla");

  window.log("== El superadmin no cambia de regla");
  await mundo();
  sesion = { id: "sa", email: "sa@x.com", nombre: "Super", rol: "superadmin", storeId: null };
  r = await cambiar("Super-1234", "12345");
  ok(r.ok === false && /al menos 8 caracteres/.test(r.error), "el superadmin sigue necesitando 8 con letras y números → " + r.error);
  r = await cambiar("Super-1234", "Nueva-4321");
  ok(r.ok === true && !bitacoras.some((b) => b.accion === "contrasena_repetida"), "y puede cambiarla (no tiene local con quién chocar)");

  window.log("== Lo que hace el superadmin desde «Usuarios»");
  await mundo();
  r = await US.restablecerPassword("luis", form({ password: "12345" }));
  ok(r.ok === false && r.error === CU.ERROR_CLAVE_REPETIDA, "restablecerle a Luis la contraseña a «12345» (la de Ana): «ya existe»");
  r = await US.restablecerPassword("luis", form({ password: "1234" }));
  ok(r.ok === false && /al menos 5 caracteres/.test(r.error), "a un cajero le pide 5, no 8 → " + r.error);
  r = await US.restablecerPassword("luis", form({ password: "luis1" }));
  ok(r.ok === true && U("luis").debeCambiarPassword === true, "una libre sirve y le exige cambiarla al entrar");
  r = await US.restablecerPassword("luis", form({ password: "luis1" }));
  ok(r.ok === true, "ponerle a Luis la que ya tiene él mismo no choca consigo");
  r = await US.restablecerPassword("sa", form({ password: "12345" }));
  ok(r.ok === false && /al menos 8 caracteres/.test(r.error), "al superadmin le sigue pidiendo 8 → " + r.error);
  r = await US.restablecerPassword("no-existe", form({ password: "abcde" }));
  ok(r.ok === false && /No encontré/.test(r.error), "un usuario que no existe no rompe nada");
  r = await US.crearUsuario(form({ email: "nuevo@x.com", nombre: "Nuevo", rol: "local", storeId: "L1", password: "12345" }));
  ok(r.ok === false && r.error === CU.ERROR_CLAVE_REPETIDA && creados === 0, "crear otro usuario del local con «12345»: «ya existe» y no se crea");
  r = await US.crearUsuario(form({ email: "nuevo@x.com", nombre: "Nuevo", rol: "local", storeId: "L1", password: "nuevo" }));
  ok(r.ok === true && creados === 1, "con una libre de 5 letras sí se crea");
  window.log("\naciertos: " + window.__aciertos + " · fallas: " + window.__fallas);
  window.__listo = true;
})().catch((e) => { document.getElementById("salida").textContent += "\nERROR: " + (e && e.stack || e); window.__listo = true; window.__fallas = (window.__fallas || 0) + 1; });
