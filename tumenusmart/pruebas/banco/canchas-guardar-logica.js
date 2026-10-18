// Anotar o corregir una reserva de cancha desde el panel (guardarReservaCancha) con la acción REAL: poner un precio menor que la tarifa pide la
// contraseña de Seguridad si el local protegió los descuentos; las reservas que no se tocan no vuelven a pedirla.
(async () => {
  const C = window.Cargador; const S = C.simulacros; const { ok } = window;

  let protegido, reservas, pedidos, hayCancha;
  const reiniciar = (conSeguridad) => { protegido = conSeguridad; reservas = []; pedidos = []; hayCancha = true; };
  // Una cancha de 100.000 la hora (a las 20:00 del miércoles 21/10/2026 no hay tarifa nocturna).
  const tarifaCancha = { id: "k1", nombre: "Cancha 1", deporte: "futbol", precioHora: 100000, precioNocturnoHora: null, nocheDesde: "19:00", duraciones: [60, 90, 120], pasoMin: 30, promos: [] };
  const horarioSemana = Array.from({ length: 7 }, (_, d) => ({ diaSemana: d, trabaja: true, inicio: "08:00", fin: "23:00", descansa: false, descansoInicio: "12:00", descansoFin: "13:00" }));
  const db = {
    cancha: { findFirst: async () => ({ id: "k1", nombre: "Cancha 1", activa: true }) },
    reservaCancha: { findFirst: async ({ where }) => { const r = reservas.find((x) => x.id === where.id); return r ? { ...r } : null; } },
  };
  const tx = {
    $executeRaw: async () => 0,
    reservaCancha: {
      // La reserva que pisa ese tramo (misma cancha, que no sea la que se está corrigiendo, ni cancelada).
      findFirst: async ({ where }) => reservas.find((x) => x.canchaId === where.canchaId && x.id !== where.id?.not && !["cancelada", "no_asistio"].includes(x.estado) && x.inicio < where.inicio.lt && x.fin > where.fin.gt) ?? null,
      updateMany: async ({ where, data }) => { const r = reservas.find((x) => x.id === where.id); Object.assign(r, data); return { count: 1 }; },
      create: async ({ data }) => { const r = { id: "r" + (reservas.length + 1), ...data }; reservas.push(r); return { id: r.id }; },
    },
  };
  S["next/cache"] = { revalidatePath() {} };
  S["src/lib/auth"] = { exigirPermiso: async () => ({ nombre: "Caja", email: "caja@x.com", rol: "empleado" }) };
  S["src/lib/bitacora"] = { registrarBitacora: async () => {} };
  S["src/lib/local-actual"] = { idLocalActual: async () => "L1" };
  S["src/lib/prisma"] = { prisma: { $transaction: async (cb) => cb(tx) } };
  S["src/lib/prisma-local"] = { prismaDelLocal: () => db };
  S["src/lib/estacion-actual"] = { estacionActual: async () => ({ id: "e1" }) };
  S["src/lib/canchas-producto"] = { sincronizarProductoDeCancha: async () => ({ ok: true, productId: "pr1" }) };
  S["src/lib/canchas-publicas"] = { cargarCanchasPublicas: async () => (hayCancha ? [tarifaCancha] : []), cargarHorarioCanchas: async () => horarioSemana };
  S["src/app/admin/(protected)/pos/actions"] = { cancelarVenta: async () => ({ ok: true }), registrarVenta: async () => ({ ok: true, ventaId: "v1", total: 1 }) };
  S["src/app/admin/(protected)/pos/turno-actual"] = { turnoAbierto: async () => ({ id: "t1" }) };
  S["src/lib/seguridad-servidor"] = { exigirAutorizacion: async (_s, _q, evento, clave) => {
    pedidos.push({ evento, clave });
    if (!protegido) return { ok: true, autorizo: null };
    if (typeof clave !== "string" || !clave) return { ok: false, error: "Hace falta la contraseña de un usuario autorizado.", requiereClave: true };
    if (clave !== "buena") return { ok: false, error: "La contraseña no es correcta.", requiereClave: true };
    return { ok: true, autorizo: "Dueño" };
  } };

  const A = await C.cargar("src/app/admin/(protected)/canchas/actions");
  const hoy = new Date(); const dia = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate() + 3)).toISOString().slice(0, 10);
  const datos = (extra = {}) => ({ canchaId: "k1", fecha: dia, hora: "20:00", duracion: 90, clienteNombre: "Equipo Rojo", clienteTelefono: "", nota: "", precio: 150000, estado: "proxima", ...extra });
  const guardar = (id, d, clave) => A.guardarReservaCancha(id, d, clave);

  window.log("== Reserva nueva a la tarifa");
  reiniciar(true);
  let r = await guardar(null, datos());
  ok(r.ok === true && reservas.length === 1 && pedidos.length === 0, "90 minutos a 150.000 (la tarifa) se guarda sin pedir contraseña, aunque los descuentos estén protegidos → " + JSON.stringify(r.ok ? "ok" : r.error));
  reiniciar(true); r = await guardar(null, datos({ precio: 200000 }));
  ok(r.ok === true && pedidos.length === 0, "un precio MÁS ALTO que la tarifa tampoco la pide");

  window.log("== Reserva nueva con precio más bajo");
  reiniciar(true);
  r = await guardar(null, datos({ precio: 100000 }));
  ok(r.ok === false && r.requiereClave === true && reservas.length === 0, "90 minutos a 100.000 (tarifa 150.000): pide la contraseña y NO guarda nada");
  r = await guardar(null, datos({ precio: 100000 }), "mala");
  ok(r.ok === false && r.requiereClave === true && /no es correcta/.test(r.error) && reservas.length === 0, "con una contraseña incorrecta se rechaza");
  r = await guardar(null, datos({ precio: 100000 }), "buena");
  ok(r.ok === true && reservas.length === 1 && reservas[0].precio === 100000, "con la del dueño se guarda, con ese precio");
  ok(pedidos.every((p) => p.evento === "descuentos"), "y el evento que se pide es «descuentos»");
  reiniciar(true); r = await guardar(null, datos({ precio: 0 }));
  ok(r.ok === false && r.requiereClave === true && reservas.length === 0, "un precio de 0 también la pide");
  reiniciar(true); r = await guardar(null, datos({ precio: 1, estado: "cancelada" }));
  ok(r.ok === false && r.requiereClave === true && reservas.length === 0, "aunque se anote ya cancelada (reactivarla después no esquiva el control)");

  window.log("== Corregir una reserva que ya existe");
  reiniciar(true);
  reservas.push({ id: "r1", canchaId: "k1", canchaNombre: "Cancha 1", clienteNombre: "Equipo Rojo", inicio: new Date(Date.parse(dia + "T20:00:00-03:00")), fin: new Date(Date.parse(dia + "T21:30:00-03:00")), duracionMin: 90, precio: 120000, estado: "proxima", ventaPosId: null });
  r = await guardar("r1", datos({ precio: 120000, nota: "Trae pelota" }));
  ok(r.ok === true && pedidos.length === 0, "una reserva vieja de 120.000 (cuando la tarifa era menor) se corrige —solo la nota— sin pedir contraseña");
  r = await guardar("r1", datos({ precio: 120000, estado: "finalizada" }));
  ok(r.ok === true && pedidos.length === 0, "y cambiarle el estado tampoco");
  r = await guardar("r1", datos({ precio: 120000, duracion: 120 }));
  ok(r.ok === false && r.requiereClave === true, "alargarla a 120 minutos dejando el mismo precio (tarifa 200.000) SÍ la pide");
  r = await guardar("r1", datos({ precio: 120000, hora: "21:00" }));
  ok(r.ok === false && r.requiereClave === true, "cambiarle la hora dejando el mismo precio (que queda bajo la tarifa) también");
  r = await guardar("r1", datos({ precio: 90000 }));
  ok(r.ok === false && r.requiereClave === true && reservas[0].precio === 120000, "bajarle el precio la pide y no cambia nada");
  r = await guardar("r1", datos({ precio: 90000 }), "buena");
  ok(r.ok === true && reservas[0].precio === 90000, "con la clave del dueño sí");
  r = await guardar("r1", datos({ precio: 160000 }));
  ok(r.ok === true, "subirle el precio hasta pasar la tarifa no la pide");

  window.log("== Si el local no protegió los descuentos");
  reiniciar(false);
  r = await guardar(null, datos({ precio: 50000 }));
  ok(r.ok === true && reservas.length === 1, "todo sigue como siempre: se puede anotar a cualquier precio");

  window.log("== Casos raros");
  reiniciar(true); hayCancha = false;
  r = await guardar(null, datos({ precio: 50000 }));
  ok(r.ok === true, "si la tarifa no se puede calcular (cancha desactivada) no se bloquea el trabajo del mostrador");
  reiniciar(true); r = await guardar(null, datos({ precio: -5 })); ok(r.ok === false && !r.requiereClave, "un precio negativo se rechaza antes de pedir nada");
  reiniciar(true); r = await guardar(null, datos({ clienteNombre: "" }), undefined); ok(r.ok === false && !r.requiereClave, "los datos mal cargados se rechazan antes de pedir la contraseña");

  window.log("\naciertos: " + window.__aciertos + " · fallas: " + window.__fallas);
  window.__listo = true;
})().catch((e) => { document.getElementById("salida").textContent += "\nERROR: " + (e && e.stack || e); window.__listo = true; window.__fallas = (window.__fallas || 0) + 1; });
