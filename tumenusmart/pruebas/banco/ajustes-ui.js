// Los formularios y botones de Ajustes con React 19 REAL y los componentes reales: ante un error o un corte de internet NO se pierde lo escrito,
// el botón no se queda trabado y el mensaje se ve; al guardar bien, los formularios de alta se limpian.
(async () => {
  const C = window.Cargador; const S = C.simulacros; const R = window.React; const { ok, igual } = window; const h = R.createElement;
  const { montar, $, $$, clic, esperar, pausa } = window;
  const SIN_RED = "No se pudo comunicar con el servidor. Revisá la conexión y probá de nuevo.";

  // «modo» decide qué contesta el servidor de mentira: "ok", "error" (un rechazo normal) o "corte" (se cayó internet: la acción LANZA).
  let modo = "ok"; const llamadas = [];
  const contestar = (nombre, valorOk) => async (...a) => { llamadas.push(nombre); if (modo === "corte") throw new Error("Failed to fetch"); if (modo === "error") return { ok: false, error: "Mensaje de prueba del servidor" }; return typeof valorOk === "function" ? valorOk(...a) : valorOk; };
  S["src/app/admin/(protected)/configuracion/actions"] = {
    crearZona: contestar("crearZona", { ok: true }), actualizarZona: contestar("actualizarZona", { ok: true }), eliminarZona: contestar("eliminarZona", { ok: true }),
    alternarActivaZona: async () => { llamadas.push("alternarActivaZona"); if (modo === "corte") throw new Error("Failed to fetch"); },
    agregarTramoHorario: contestar("agregarTramoHorario", { ok: true }), cambiarUrlPublica: contestar("cambiarUrlPublica", { ok: true, slug: "nuevo" }),
    alternarPausaPedidos: async () => { llamadas.push("alternarPausaPedidos"); if (modo === "corte") throw new Error("Failed to fetch"); },
    guardarMensajePausa: async () => { llamadas.push("guardarMensajePausa"); if (modo === "corte") throw new Error("Failed to fetch"); },
    subirFotoLogo: contestar("subirFotoLogo", { ok: true, url: "x" }),
    quitarLogoStore: async () => { llamadas.push("quitarLogoStore"); if (modo === "corte") throw new Error("Failed to fetch"); },
  };
  S["src/app/admin/(protected)/empleados/actions"] = {
    crearEmpleado: contestar("crearEmpleado", { ok: true, password: "kfrt-9mzq-2vbn" }), restablecerPasswordEmpleado: contestar("restablecerPasswordEmpleado", { ok: true, password: "aaaa-bbbb-3333" }),
    alternarActivoEmpleado: contestar("alternarActivoEmpleado", { ok: true }), cambiarPerfilSeguridadEmpleado: contestar("cambiarPerfilSeguridadEmpleado", { ok: true }),
  };
  let avisos = []; window.alert = (t) => avisos.push(String(t));

  const escribir = (el, v) => { Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value").set.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); };
  const enviar = (form) => form.requestSubmit();
  const texto = () => document.getElementById("raiz").textContent;
  const campo = (n) => $(`[name="${n}"]`);

  // ============================================================================================== Zonas
  window.log("== Zonas de envío: alta");
  const { CrearZonaForm } = await C.cargar("src/app/admin/(protected)/configuracion/CrearZonaForm");
  montar(h(CrearZonaForm)); await pausa(100);
  escribir(campo("nombre"), "Zona 1"); escribir(campo("radioKm"), "2"); escribir(campo("costoEnvio"), "5000");
  modo = "error"; enviar($("form")); await esperar(() => /Mensaje de prueba/.test(texto()));
  ok(/Mensaje de prueba del servidor/.test(texto()), "un rechazo del servidor se ve en pantalla");
  ok(campo("nombre").value === "Zona 1" && campo("radioKm").value === "2" && campo("costoEnvio").value === "5000", "y lo escrito NO se pierde (antes React 19 vaciaba los campos)");
  modo = "corte"; enviar($("form")); await esperar(() => texto().includes("Revisá la conexión"));
  ok(texto().includes(SIN_RED), "con internet cortado se explica en español (no «Failed to fetch») → " + texto().slice(0, 80));
  ok(campo("nombre").value === "Zona 1" && !$("button[type=submit]").disabled, "lo escrito sigue ahí y el botón NO queda trabado");
  modo = "ok"; enviar($("form")); await esperar(() => campo("nombre").value === "");
  ok(campo("nombre").value === "" && campo("radioKm").value === "" && !/Mensaje de prueba|Revisá la conexión/.test(texto()), "guardado bien: el formulario se limpia y el error desaparece");

  window.log("== Zona existente: activar/desactivar y borrar");
  const { ZonaFila } = await C.cargar("src/app/admin/(protected)/configuracion/ZonaFila");
  montar(h(ZonaFila, { id: "z1", nombre: "Centro", radioKm: 3, costoEnvio: 8000, activo: true })); await pausa(100);
  avisos = []; modo = "corte";
  clic($$("button").find((b) => b.textContent === "Desactivar")); await esperar(() => avisos.length > 0);
  ok(avisos[0] === SIN_RED, "desactivar con internet cortado avisa en español en vez de romper la pantalla → " + avisos[0]);
  ok(!$$("button").find((b) => b.textContent === "Desactivar").disabled, "y el botón queda libre para reintentar");
  window.confirm = () => true; avisos = [];
  clic($$("button").find((b) => b.textContent === "Borrar")); await esperar(() => avisos.length > 0);
  ok(avisos[0] === SIN_RED, "borrar con internet cortado también avisa");
  modo = "ok";

  window.log("== Horario: agregar un tramo");
  const { AgregarTramoForm } = await C.cargar("src/app/admin/(protected)/configuracion/horarios/AgregarTramoForm");
  montar(h(AgregarTramoForm, { dia: 1, diaLabel: "lunes" })); await pausa(100);
  escribir(campo("abre"), "09:00"); escribir(campo("cierra"), "18:00"); avisos = [];
  modo = "corte"; enviar($("form")); await esperar(() => avisos.length > 0);
  ok(avisos[0] === SIN_RED && campo("abre").value === "09:00" && campo("cierra").value === "18:00", "con internet cortado avisa y conserva las horas escritas");
  modo = "ok"; enviar($("form")); await esperar(() => campo("abre").value === "");
  ok(campo("abre").value === "" && campo("cierra").value === "", "guardado bien: se limpian las horas");

  // ============================================================================================== Dirección, pausa, logo
  window.log("== Dirección pública de la carta");
  const { UrlPublicaField } = await C.cargar("src/app/admin/(protected)/configuracion/UrlPublicaField");
  montar(h(UrlPublicaField, { slug: "mi-local" })); await pausa(100);
  clic($$("button").find((b) => b.textContent === "Cambiar dirección")); await pausa(50);
  escribir($("input"), "otro-nombre"); modo = "corte";
  clic($$("button").find((b) => b.textContent === "Guardar dirección")); await esperar(() => texto().includes("Revisá la conexión"));
  ok(texto().includes(SIN_RED), "con internet cortado se explica y no queda en «Guardando…»");
  ok($$("button").find((b) => b.textContent === "Guardar dirección") && !$$("button").find((b) => b.textContent === "Guardar dirección").disabled, "el botón queda libre");
  modo = "ok";

  window.log("== Pausar pedidos");
  const { PausaPedidosToggle } = await C.cargar("src/app/admin/(protected)/PausaPedidosToggle");
  montar(h(PausaPedidosToggle, { pausado: false, mensaje: null })); await pausa(100);
  modo = "corte"; clic($$("button").find((b) => b.textContent === "Pausar pedidos")); await esperar(() => texto().includes("Revisá la conexión"));
  ok(texto().includes(SIN_RED) && !!$$("button").find((b) => b.textContent === "Pausar pedidos"), "si no se pudo pausar, avisa y el botón vuelve a decir «Pausar pedidos» (no queda pausado en pantalla)");
  modo = "ok";

  window.log("== Logo del negocio");
  const { LogoField } = await C.cargar("src/app/admin/(protected)/configuracion/LogoField");
  montar(h(LogoField, { initialUrl: "https://x/logo.png" })); await pausa(100);
  modo = "corte"; clic($$("button").find((b) => b.textContent === "Quitar logo")); await esperar(() => texto().includes("Revisá la conexión"));
  ok(texto().includes(SIN_RED) && !!$("img[alt='Logo del negocio']"), "si no se pudo quitar, avisa y el logo SIGUE viéndose (sigue puesto)");
  modo = "ok";

  // ============================================================================================== Usuarios
  window.log("== Usuarios del sistema: alta");
  const { GestionEmpleados } = await C.cargar("src/app/admin/(protected)/empleados/GestionEmpleados");
  montar(h(GestionEmpleados, { empleados: [], nombreLocal: "Mi Local" })); await pausa(100);
  escribir(campo("nombre"), "Carlos"); escribir(campo("email"), "carlos@x.com");
  modo = "corte"; enviar($("form")); await esperar(() => texto().includes("no sabemos si el usuario quedó creado"));
  ok(texto().includes("no sabemos si el usuario quedó creado") && texto().includes("Nueva contraseña"), "con internet cortado avisa que puede haber quedado creado y qué hacer");
  ok(campo("nombre").value === "Carlos" && campo("email").value === "carlos@x.com", "y lo escrito se conserva");
  modo = "error"; enviar($("form")); await esperar(() => texto().includes("Mensaje de prueba"));
  ok(campo("nombre").value === "Carlos", "un rechazo (correo repetido) también conserva lo escrito");
  modo = "ok"; enviar($("form")); await esperar(() => texto().includes("kfrt-9mzq-2vbn"));
  ok(texto().includes("kfrt-9mzq-2vbn") && texto().includes("Carlos ya puede entrar") && campo("nombre").value === "", "creado: se muestra la contraseña (una vez) y el formulario queda limpio");
  window.log("== Usuarios: acciones de una persona");
  montar(h(GestionEmpleados, { empleados: [{ id: "e1", nombre: "Ana", email: "ana@x.com", activo: true, perfil: "caja", ultimoIngreso: null }], nombreLocal: "Mi Local" })); await pausa(100);
  modo = "corte"; clic($$("button").find((b) => b.textContent === "Nueva contraseña")); await esperar(() => texto().includes("no sabemos si la contraseña se cambió"));
  ok(texto().includes("no sabemos si la contraseña se cambió"), "«Nueva contraseña» con internet cortado explica que puede haberse cambiado");
  clic($$("button").find((b) => b.textContent === "Quitar acceso")); await esperar(() => texto().includes("Revisá la conexión"));
  ok(texto().includes(SIN_RED), "«Quitar acceso» con internet cortado avisa");
  ok($$("button").every((b) => !b.disabled), "y ningún botón queda trabado");
  modo = "ok";

  window.log("\naciertos: " + window.__aciertos + " · fallas: " + window.__fallas);
  window.__listo = true;
})().catch((e) => { document.getElementById("salida").textContent += "\nERROR: " + (e && e.stack || e); window.__listo = true; window.__fallas = (window.__fallas || 0) + 1; });
