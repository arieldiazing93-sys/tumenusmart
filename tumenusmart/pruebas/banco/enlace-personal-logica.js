// El enlace privado de cada profesional (/personal/<id>-<firma>): el id es PÚBLICO (la página de reservas lo manda al navegador), así que el
// enlace tiene que llevar una firma que solo el servidor puede calcular. Se prueba la firma y las acciones REALES del enlace.
(async () => {
  const C = window.Cargador; const S = C.simulacros; const { ok } = window;

  // ------------------------------------------------------------------------------------------ el node:crypto de mentira, comprobado contra el navegador
  await new Promise((res, rej) => { const s = document.createElement("script"); s.src = "cripto.js"; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
  ok(window.CriptoBanco.instalar(S), "el HMAC-SHA256 de la prueba coincide con los vectores oficiales (abc, RFC 4231, 1.000 letras)");
  const aleatorios = Array.from({ length: 60 }, () => crypto.getRandomValues(new Uint8Array(Math.floor(Math.random() * 300))));
  let igualesAlNavegador = 0;
  for (const bytes of aleatorios) {
    const mio = window.CriptoBanco.cripto.createHash("sha256").update(bytes).digest("hex");
    const real = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (b) => b.toString(16).padStart(2, "0")).join("");
    const llave = await crypto.subtle.importKey("raw", new TextEncoder().encode("clave"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const hmacReal = Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", llave, bytes)), (b) => b.toString(16).padStart(2, "0")).join("");
    if (mio === real && window.CriptoBanco.cripto.createHmac("sha256", "clave").update(bytes).digest("hex") === hmacReal) igualesAlNavegador++;
  }
  ok(igualesAlNavegador === 60, "y da lo mismo que el navegador en 60 mensajes al azar de 0 a 300 bytes (" + igualesAlNavegador + "/60)");

  window.process = { env: { SESSION_SECRET: "secreto-de-prueba-123", NODE_ENV: "test" } };
  const E = await C.cargar("src/lib/enlace-personal");

  // ============================================================================================== la firma
  window.log("== La firma del enlace");
  const id = "cmgabc123def456ghi789jkl0";
  const enlace = E.enlaceDePersonal(id);
  ok(enlace.startsWith(id + "-") && enlace.length === id.length + 1 + 32, "el enlace es <id>-<32 letras y números de firma> → " + enlace);
  ok(E.personalIdDeEnlace(enlace) === id, "con la firma correcta se abre y devuelve el id de la persona");
  ok(E.personalIdDeEnlace(id) === null, "con SOLO el id (lo que muestra la página pública de reservas) NO abre");
  ok(E.personalIdDeEnlace(id + "-") === null && E.personalIdDeEnlace("-" + enlace.split("-")[1]) === null, "ni con la firma vacía ni sin id");
  const firma = enlace.split("-")[1];
  const alterada = firma.slice(0, -1) + (firma.slice(-1) === "0" ? "1" : "0");
  ok(E.personalIdDeEnlace(id + "-" + alterada) === null, "cambiar una sola letra de la firma lo rechaza");
  ok(E.personalIdDeEnlace(id + "-" + firma.slice(0, 31)) === null && E.personalIdDeEnlace(id + "-" + firma + "0") === null, "una firma más corta o más larga se rechaza");
  const otroId = "cmgzzz999yyy888xxx777www0";
  ok(E.personalIdDeEnlace(otroId + "-" + firma) === null, "la firma de una persona no sirve para el id de otra");
  ok(E.personalIdDeEnlace(E.enlaceDePersonal(otroId)) === otroId, "cada persona tiene la suya y funciona");
  ok(E.enlaceDePersonal(id) !== E.enlaceDePersonal(otroId) && E.enlaceDePersonal(id) === enlace, "la firma es estable (siempre la misma para la misma persona) y distinta entre personas");
  for (const raro of [undefined, null, 123, {}, [], "", "-", "--", "..", "a-b-c", enlace + "-x", "  " + enlace]) {
    ok(E.personalIdDeEnlace(raro) === null, "un valor raro (" + JSON.stringify(raro) + ") no abre nada");
  }

  // Con otra clave secreta, los enlaces viejos dejan de servir (cambiar SESSION_SECRET los invalida a todos).
  window.process.env.SESSION_SECRET = "otra-clave-distinta-456";
  ok(E.personalIdDeEnlace(enlace) === null, "si cambia la clave secreta del servidor, los enlaces firmados antes dejan de abrir");
  window.process.env.SESSION_SECRET = "secreto-de-prueba-123";
  ok(E.personalIdDeEnlace(enlace) === id, "y con la clave de siempre vuelven a abrir");

  // Sin clave configurada en producción NO se firma con un valor de ejemplo.
  window.process.env.SESSION_SECRET = ""; window.process.env.NODE_ENV = "production";
  let corto = false; try { E.enlaceDePersonal(id); } catch { corto = true; }
  ok(corto, "en producción, sin SESSION_SECRET, se corta en vez de firmar con la clave de ejemplo");
  window.process.env.SESSION_SECRET = "secreto-de-prueba-123"; window.process.env.NODE_ENV = "test";

  // 3.000 ids al azar: ida y vuelta, y ninguno abre con la firma de otro.
  const azar = () => "c" + Array.from({ length: 24 }, () => "0123456789abcdefghijklmnopqrstuvwxyz"[Math.floor(Math.random() * 36)]).join("");
  let malos = 0;
  for (let i = 0; i < 3000; i++) { const a = azar(), b = azar(); const ea = E.enlaceDePersonal(a); if (E.personalIdDeEnlace(ea) !== a || E.personalIdDeEnlace(b + "-" + ea.split("-")[1]) !== null || E.personalIdDeEnlace(a) !== null) malos++; }
  ok(malos === 0, "3.000 ids al azar: todos van y vuelven, y ninguno abre con solo el id ni con la firma de otro (" + malos + " con problemas)");

  // ============================================================================================== las acciones del enlace público
  window.log("== Buscar clientes y subir fotos desde el enlace");
  let busquedas = [], subidas = [], fotosActualizadas = [];
  const miembros = new Map([[id, { id, activo: true, storeId: "L1" }], [otroId, { id: otroId, activo: false, storeId: "L1" }]]);
  const clientes = [{ id: "c1", storeId: "L1", nombre: "Ana", telefono: "0981123456", fotoUrl: null }, { id: "c2", storeId: "L2", nombre: "De otro local", telefono: "0981999999", fotoUrl: null }];
  S["src/lib/imagenes"] = { descartarImagenes: async () => {} };
  S["src/lib/supabase-storage"] = { subirFotoCliente: async () => { subidas.push(1); return "https://x/foto.jpg"; } };
  S["src/lib/prisma"] = { prisma: {
    miembroPersonal: { findUnique: async ({ where }) => miembros.get(where.id) ?? null },
    customer: {
      findMany: async ({ where }) => { busquedas.push(where); return clientes.filter((c) => c.storeId === where.storeId && c.telefono.includes(where.telefono.contains)); },
      findUnique: async ({ where }) => clientes.find((c) => c.id === where.id) ?? null,
      update: async ({ where, data }) => { fotosActualizadas.push({ id: where.id, data }); return {}; },
    },
  } };
  const A = await C.cargar("src/app/personal/[id]/actions");
  const archivo = (() => { const f = new File([new Uint8Array(10)], "a.jpg", { type: "image/jpeg" }); const fd = new FormData(); fd.set("archivo", f); return fd; })();

  let r = await A.buscarClientePorTelefono(E.enlaceDePersonal(id), "0981 123");
  ok(r.ok === true && r.clientes.length === 1 && r.clientes[0].nombre === "Ana" && busquedas.length === 1 && busquedas[0].storeId === "L1", "con el enlace firmado busca, y solo dentro de SU local");
  busquedas = [];
  r = await A.buscarClientePorTelefono(id, "0981 123");
  ok(r.ok === false && /ya no está activo/.test(r.error) && busquedas.length === 0, "con SOLO el id (el que se ve en la página de reservas) no busca nada → " + (r.ok ? "" : r.error));
  for (const rareza of [undefined, null, 5, {}, id + "-" + "0".repeat(32)]) {
    r = await A.buscarClientePorTelefono(rareza, "0981 123");
    ok(r.ok === false && busquedas.length === 0, "un enlace raro (" + JSON.stringify(rareza) + ") no busca nada");
  }
  r = await A.buscarClientePorTelefono(E.enlaceDePersonal(otroId), "0981 123");
  ok(r.ok === false && busquedas.length === 0, "el enlace firmado de una persona dada de baja tampoco busca");
  r = await A.buscarClientePorTelefono(E.enlaceDePersonal(id), "123");
  ok(r.ok === false && /4 números/.test(r.error), "con menos de 4 números se rechaza");
  r = await A.buscarClientePorTelefono(E.enlaceDePersonal(id), undefined);
  ok(r.ok === false, "un teléfono que no es texto no rompe nada (se rechaza)");

  r = await A.subirFotoClienteDesdeEnlace(id, "c1", archivo);
  ok(r.ok === false && subidas.length === 0 && fotosActualizadas.length === 0, "con solo el id no se puede cambiar la foto de ningún cliente");
  r = await A.subirFotoClienteDesdeEnlace(E.enlaceDePersonal(id), "c2", archivo);
  ok(r.ok === false && /no encontrado/i.test(r.error) && subidas.length === 0, "con el enlace correcto, un cliente de OTRO local no se toca");
  r = await A.subirFotoClienteDesdeEnlace(E.enlaceDePersonal(id), "c1", archivo);
  ok(r.ok === true && subidas.length === 1 && fotosActualizadas.length === 1 && fotosActualizadas[0].id === "c1", "con el enlace correcto y un cliente de su local sí sube la foto");

  window.log("\naciertos: " + window.__aciertos + " · fallas: " + window.__fallas);
  window.__listo = true;
})().catch((e) => { document.getElementById("salida").textContent += "\nERROR: " + (e && e.stack || e); window.__listo = true; window.__fallas = (window.__fallas || 0) + 1; });
