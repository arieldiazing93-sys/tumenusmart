// El cobro de una cita de la agenda (cobrarCita) con la acción REAL: cobrar MENOS que el precio de lista —por un descuento o bajando el precio
// de un servicio a mano— pide la contraseña de Seguridad cuando el local protegió los descuentos. El motor de ventas (registrarVenta) va simulado.
(async () => {
  const C = window.Cargador; const S = C.simulacros; const { ok } = window;

  let protegido, guardadas, ventas, pedidosDeClave, cita, turno;
  const reiniciar = (conSeguridad) => { protegido = conSeguridad; guardadas = 0; ventas = []; pedidosDeClave = []; turno = { id: "t1" }; cita = { id: "c1", estado: "proxima", ventaPosId: null, bufferMin: 0, servicios: [{ id: "cs1", servicioId: "s1", nombre: "Corte", duracionMin: 30 }] }; };
  const catalogo = [
    { id: "s1", productId: "pr1", duracionMin: 30, bufferMin: 0, product: { nombre: "Corte", precio: 50000 } },
    { id: "s2", productId: "pr2", duracionMin: 20, bufferMin: 0, product: { nombre: "Barba", precio: 30000 } },
  ];
  const db = {
    cita: { findFirst: async () => ({ ...cita }) },
    miembroPersonal: { findFirst: async () => ({ id: "p1" }) },
    servicioAgenda: { findMany: async ({ where }) => catalogo.filter((s) => where.id.in.includes(s.id)) },
  };
  const tx = { cita: { updateMany: async () => { guardadas++; return { count: 1 }; } }, citaServicio: { deleteMany: async () => ({}), createMany: async () => ({}) } };
  S["next/cache"] = { revalidatePath() {} };
  S["src/lib/auth"] = { exigirPermiso: async () => ({ nombre: "Caja", email: "caja@x.com", rol: "empleado" }) };
  S["src/lib/bitacora"] = { registrarBitacora: async () => {} };
  S["src/lib/local-actual"] = { idLocalActual: async () => "L1" };
  S["src/lib/prisma"] = { prisma: { $transaction: async (cb) => cb(tx) } };
  S["src/lib/prisma-local"] = { prismaDelLocal: () => db };
  S["src/lib/estacion-actual"] = { estacionActual: async () => ({ id: "e1" }) };
  S["src/app/admin/(protected)/pos/turno-actual"] = { turnoAbierto: async () => turno };
  S["src/app/admin/(protected)/pos/actions"] = {
    cancelarVenta: async () => ({ ok: true }),
    registrarVenta: async (_t, d) => { ventas.push(d); return { ok: true, ventaId: "v1", total: 1 }; },
  };
  // Seguridad: con «descuentos» protegido hace falta la clave «buena».
  S["src/lib/seguridad-servidor"] = { exigirAutorizacion: async (_s, _q, evento, clave) => {
    pedidosDeClave.push({ evento, clave });
    if (!protegido) return { ok: true, autorizo: null };
    if (typeof clave !== "string" || clave.length === 0) return { ok: false, error: "Hace falta la contraseña de un usuario autorizado.", requiereClave: true };
    if (clave !== "buena") return { ok: false, error: "La contraseña no es correcta.", requiereClave: true };
    return { ok: true, autorizo: "Dueño" };
  } };

  const A = await C.cargar("src/app/admin/(protected)/agenda/actions");
  const datos = (extra = {}) => ({ estado: "proxima", clienteNombre: "Ana", clienteTelefono: "", personalId: "p1", fecha: "2026-10-20", hora: "10:00", descuento: null,
    servicios: [{ servicioId: "s1", citaServicioId: "cs1", precio: 50000 }, { servicioId: "s2", citaServicioId: null, precio: 30000 }], ...extra });
  const cobro = { forma: "efectivo", comprobanteTipo: "ticket", registroFiscal: "sin", tipoIdentificacion: "", numeroIdentificacion: "", razonSocial: "", email: "", telefono: "" };
  const cobrar = (d, clave) => A.cobrarCita("c1", d, cobro, clave);

  window.log("== Cobro de una cita a precio de lista");
  reiniciar(true);
  let r = await cobrar(datos());
  ok(r.ok === true && ventas.length === 1 && guardadas === 1, "a precio de lista, con los descuentos protegidos, se cobra sin pedir clave → " + JSON.stringify(r.ok ? "ok" : r.error));
  ok(pedidosDeClave.length === 0, "y ni siquiera se pregunta por la autorización (no hay nada que autorizar)");
  reiniciar(true); r = await cobrar(datos({ servicios: [{ servicioId: "s1", citaServicioId: "cs1", precio: 60000 }, { servicioId: "s2", citaServicioId: null, precio: 30000 }] }));
  ok(r.ok === true && pedidosDeClave.length === 0, "un precio MÁS ALTO que el de lista (un extra) tampoco pide clave");

  window.log("== Descuento general");
  reiniciar(true);
  r = await cobrar(datos({ descuento: { tipo: "porcentaje", valor: 10 } }));
  ok(r.ok === false && r.requiereClave === true && ventas.length === 0 && guardadas === 0, "con un 10 % de descuento y sin clave: pide la contraseña y NO guarda ni cobra nada");
  r = await cobrar(datos({ descuento: { tipo: "porcentaje", valor: 10 } }), "mala");
  ok(r.ok === false && r.requiereClave === true && /no es correcta/.test(r.error) && ventas.length === 0, "con una clave incorrecta se rechaza y dice por qué");
  r = await cobrar(datos({ descuento: { tipo: "monto", valor: 5000 } }), "buena");
  ok(r.ok === true && ventas.length === 1 && guardadas === 1 && ventas[0].descuento?.valor === 5000, "con la clave correcta se cobra, con el descuento");
  ok(pedidosDeClave.every((p) => p.evento === "descuentos"), "y lo que se pide es el evento «descuentos»");

  window.log("== Bajar el precio de un servicio a mano");
  reiniciar(true);
  r = await cobrar(datos({ servicios: [{ servicioId: "s1", citaServicioId: "cs1", precio: 30000 }, { servicioId: "s2", citaServicioId: null, precio: 30000 }] }));
  ok(r.ok === false && r.requiereClave === true && ventas.length === 0 && guardadas === 0, "bajar un servicio de 50.000 a 30.000 es un descuento escondido: pide la contraseña y no cobra");
  r = await cobrar(datos({ servicios: [{ servicioId: "s1", citaServicioId: "cs1", precio: 30000 }, { servicioId: "s2", citaServicioId: null, precio: 30000 }] }), "buena");
  ok(r.ok === true && ventas.length === 1, "con la clave del dueño, sí");
  reiniciar(true);
  r = await cobrar(datos({ servicios: [{ servicioId: "s1", citaServicioId: "cs1", precio: 1 }, { servicioId: "s2", citaServicioId: null, precio: 30000 }] }));
  ok(r.ok === false && r.requiereClave === true && ventas.length === 0, "cobrar un servicio a 1 guaraní pide la contraseña");
  reiniciar(true);
  r = await cobrar(datos({ servicios: [{ servicioId: "s1", citaServicioId: "cs1", precio: 80000 }, { servicioId: "s2", citaServicioId: null, precio: 10000 }] }));
  ok(r.ok === false && r.requiereClave === true, "subir un servicio no compensa la rebaja de otro: la rebaja de 20.000 igual pide clave");
  reiniciar(true);
  r = await cobrar(datos({ servicios: [{ servicioId: "s1", citaServicioId: "cs1", precio: 0 }, { servicioId: "s2", citaServicioId: null, precio: 30000 }] }));
  ok(r.ok === false && r.requiereClave === true && ventas.length === 0, "un servicio a 0 con otro a precio de lista también pide la contraseña");

  window.log("== Si el local no protegió los descuentos");
  reiniciar(false);
  r = await cobrar(datos({ descuento: { tipo: "porcentaje", valor: 20 }, servicios: [{ servicioId: "s1", citaServicioId: "cs1", precio: 40000 }, { servicioId: "s2", citaServicioId: null, precio: 30000 }] }));
  ok(r.ok === true && ventas.length === 1, "sin protección en Ajustes → Seguridad, todo sigue como siempre (descuento y precio editado)");

  window.log("== Las reglas de antes siguen");
  reiniciar(true); cita.ventaPosId = "vX"; r = await cobrar(datos()); ok(r.ok === false && /ya está cobrada/.test(r.error), "una cita ya cobrada no se cobra de nuevo");
  reiniciar(true); turno = null; r = await cobrar(datos({ descuento: { tipo: "monto", valor: 1000 } }), "buena"); ok(r.ok === false && r.sinTurno === true, "sin turno de caja manda a abrir el turno (antes de pedir nada)");
  reiniciar(true); r = await cobrar(datos({ servicios: [{ servicioId: "s1", citaServicioId: "cs1", precio: -5 }] })); ok(r.ok === false, "un precio negativo se rechaza");
  reiniciar(true); r = await cobrar(datos({ servicios: [{ servicioId: "inventado", citaServicioId: null, precio: 100 }] })); ok(r.ok === false, "un servicio que no existe se rechaza");

  window.log("\naciertos: " + window.__aciertos + " · fallas: " + window.__fallas);
  window.__listo = true;
})().catch((e) => { document.getElementById("salida").textContent += "\nERROR: " + (e && e.stack || e); window.__listo = true; window.__fallas = (window.__fallas || 0) + 1; });
