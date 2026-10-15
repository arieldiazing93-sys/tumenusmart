// Prueba de qué turnos van en la lista de trabajo del enlace público de cada profesional (src/lib/agenda-personal.ts → estadoEnElPerfil).
(async () => {
  const { ok, igual } = window;
  const C = window.Cargador;
  const ap = await C.cargar("src/lib/agenda-personal");
  const c = (extra) => ({ estado: "proxima", visible: true, origen: "panel", ventaPos: null, ...extra });

  window.log("== Perfil público: qué turnos se ven");
  igual(ap.estadoEnElPerfil(c({ ventaPos: { cancelada: false } })), "cobrada", "un turno cobrado: se ve, como cobrado");
  igual(ap.estadoEnElPerfil(c({})), "reservada", "un turno anotado en el calendario y sin cobrar: se ve, como reservado");
  igual(ap.estadoEnElPerfil(c({ origen: "web" })), "reservada", "un turno que pidió el cliente desde la página y sigue sin cobrar: se ve, como reservado");
  igual(ap.estadoEnElPerfil(c({ estado: "pendiente" })), "reservada", "pendiente de confirmar: se ve, como reservado");
  igual(ap.estadoEnElPerfil(c({ estado: "finalizada" })), "reservada", "terminado pero sin cobrar: se ve (le falta cobrarlo)");
  igual(ap.estadoEnElPerfil(c({ ventaPos: { cancelada: true } })), "reservada", "con el cobro anulado vuelve a estar reservado, sin cobrar");

  igual(ap.estadoEnElPerfil(c({ estado: "cancelada" })), null, "cancelado: no se ve");
  igual(ap.estadoEnElPerfil(c({ estado: "no_asistio" })), null, "el cliente no vino: no se ve");
  igual(ap.estadoEnElPerfil(c({ visible: false, origen: "web" })), null, "un turno de la web que espera el aviso por WhatsApp: no se ve (como en el calendario)");
  igual(ap.estadoEnElPerfil(c({ origen: "mostrador", ventaPos: { cancelada: true } })), null, "algo del mostrador con el cobro anulado: no es un turno agendado");
  igual(ap.estadoEnElPerfil(c({ origen: "mostrador", ventaPos: { cancelada: false } })), "cobrada", "lo del mostrador cobrado sí se ve (trabajo hecho hoy)");
  igual(ap.estadoEnElPerfil(c({ estado: "cancelada", ventaPos: { cancelada: false } })), "cobrada", "si ya estaba cobrado y no se anuló el cobro, se ve como cobrado (igual que antes)");

  window.log("\naciertos: " + window.__aciertos + " · fallas: " + window.__fallas);
  window.__listo = true;
})().catch((e) => { document.getElementById("salida").textContent += "\nERROR: " + (e && e.stack || e); window.__listo = true; window.__fallas = (window.__fallas || 0) + 1; });
