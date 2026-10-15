// Prueba del pago de comisiones del personal de la Reserva de turnos: lo ganado (servicios y productos), lo pagado y lo que se les debe
// (src/lib/comision-personal-servidor.ts), con una base de mentira. Las validaciones del pago son las mismas de los mozos (comision-mozo.ts).
(async () => {
  const { ok, igual } = window;
  const C = window.Cargador;

  const sv = await C.cargar("src/lib/comision-personal-servidor");
  const cm = await C.cargar("src/lib/comision-mozo");
  const d = (s) => new Date(s + "T12:00:00Z");

  window.log("== Comisión del personal: ganado, pagado y pendiente");
  const equipo = [
    { id: "A", comisionPorcentaje: 10, comisionProductoPorcentaje: 5 },
    { id: "B", comisionPorcentaje: null, comisionProductoPorcentaje: null },
    { id: "C", comisionPorcentaje: 20, comisionProductoPorcentaje: null },
  ];
  const citas = [
    // A: un trabajo con el % guardado al cobrar (10 %), uno anterior a la comisión (usa el de hoy: 10 %), uno con la venta cancelada y uno sin cobrar.
    { personalId: "A", inicio: d("2026-10-02"), comisionPorcentaje: 10, precio: 100000, ventaPos: { total: 100000, cancelada: false } }, // 10.000
    { personalId: "A", inicio: d("2026-10-10"), comisionPorcentaje: null, precio: null, ventaPos: { total: 80000, cancelada: false } }, // 8.000 (con el total de la venta)
    { personalId: "A", inicio: d("2026-10-03"), comisionPorcentaje: 10, precio: 50000, ventaPos: { total: 50000, cancelada: true } }, // no cuenta
    { personalId: "A", inicio: d("2026-10-04"), comisionPorcentaje: 10, precio: 50000, ventaPos: null }, // sin cobrar: no cuenta
    // B: sin comisión cargada: gana 0.
    { personalId: "B", inicio: d("2026-10-02"), comisionPorcentaje: null, precio: 70000, ventaPos: { total: 70000, cancelada: false } },
    // C: el % guardado manda aunque hoy tenga otro.
    { personalId: "C", inicio: d("2026-10-06"), comisionPorcentaje: 15, precio: 60000, ventaPos: { total: 60000, cancelada: false } }, // 9.000
  ];
  const ventas = [
    { personalId: "A", creadoEn: d("2026-10-05"), comisionProductoPorcentaje: 5, comisionProductoBase: 40000, cancelada: false }, // 2.000
    { personalId: "A", creadoEn: d("2026-10-12"), comisionProductoPorcentaje: null, comisionProductoBase: 20000, cancelada: false }, // 1.000 (el de hoy: 5 %)
    { personalId: "A", creadoEn: d("2026-10-06"), comisionProductoPorcentaje: 5, comisionProductoBase: 90000, cancelada: true }, // no cuenta
    { personalId: null, creadoEn: d("2026-10-06"), comisionProductoPorcentaje: 5, comisionProductoBase: 90000, cancelada: false }, // de nadie
  ];
  const pagos = [
    { personalId: "A", monto: 5000, createdAt: d("2026-10-06") },
    { personalId: "A", monto: 3000, createdAt: d("2026-10-11") },
    { personalId: "C", monto: 12000, createdAt: d("2026-10-07") }, // se le pagó de más: debe 0
  ];
  const consultas = [];
  const filtraPersonal = (filas, where) => filas.filter((f) => where.personalId === undefined || f.personalId === where.personalId);
  const dbFalsa = {
    miembroPersonal: {
      findMany: async ({ where }) => {
        consultas.push(where);
        return equipo.filter((p) => where.id === undefined || p.id === where.id);
      },
    },
    cita: {
      findMany: async ({ where }) => {
        consultas.push(where);
        return filtraPersonal(citas, where).filter((c) => c.ventaPos && c.ventaPos.cancelada === false);
      },
    },
    ventaPos: {
      findMany: async ({ where }) => {
        consultas.push(where);
        return ventas.filter((v) => {
          if (v.cancelada !== false) return false;
          if (typeof where.personalId === "string") return v.personalId === where.personalId;
          return v.personalId !== null;
        });
      },
    },
    pagoComisionPersonal: {
      findMany: async ({ where }) => {
        consultas.push(where);
        return filtraPersonal(pagos, where);
      },
    },
  };

  const todos = await sv.saldosDeComisionPersonal(dbFalsa, "local-1");
  const a = todos.get("A");
  igual(a.ganadaServicios, 18000, "A ganó 10.000 + 8.000 de servicios (el cancelado y el sin cobrar no suman)");
  igual(a.ganadaProductos, 3000, "A ganó 2.000 + 1.000 de productos (el cancelado no suma)");
  igual(a.ganada, 21000, "A ganó 21.000 en total");
  igual(a.pagada, 8000, "a A se le pagaron 5.000 + 3.000");
  igual(a.pendiente, 13000, "a A se le deben 13.000");
  ok(!todos.has("B"), "B no tiene comisión cargada: no gana ni aparece");
  igual(todos.get("C").ganada, 9000, "C ganó 9.000 con el 15 % guardado (no con el 20 % de hoy)");
  igual(todos.get("C").pendiente, 0, "a C se le pagó de más: debe 0, no negativo");
  ok(consultas.every((w) => w.storeId === "local-1"), "toda consulta lleva el local");

  window.log("== Comisión del personal: por período");
  const corto = await sv.saldosDeComisionPersonal(dbFalsa, "local-1", { periodo: { gte: d("2026-10-01"), lt: d("2026-10-08") } });
  igual(corto.get("A").ganadaEnPeriodo, 12000, "del 1 al 7: A ganó 10.000 de un trabajo y 2.000 de un producto");
  igual(corto.get("A").pagadaEnPeriodo, 5000, "del 1 al 7: se le pagaron 5.000 (el pago del 11 queda afuera)");
  igual(corto.get("A").pendiente, 13000, "lo que se le debe no depende del período");
  const sinPeriodo = await sv.saldosDeComisionPersonal(dbFalsa, "local-1");
  igual(sinPeriodo.get("A").ganadaEnPeriodo, 21000, "sin período, lo del período es todo");

  window.log("== Comisión del personal: una sola persona");
  const soloA = await sv.saldosDeComisionPersonal(dbFalsa, "local-1", { personalId: "A" });
  ok(soloA.has("A") && !soloA.has("C"), "con una persona pedida, solo vuelve esa persona");
  igual(soloA.get("A").pendiente, 13000, "y el saldo es el mismo");
  const nadie = await sv.saldosDeComisionPersonal(dbFalsa, "local-1", { personalId: "Z" });
  ok(nadie.size === 0, "alguien sin movimiento no aparece (se le debe 0)");

  window.log("== Comisión del personal: validar el pago (las mismas reglas que los mozos)");
  const v = (x, p) => cm.validarPagoDeComision(x, p);
  ok(v({ monto: 13000 }, 13000).ok, "pagar todo lo que se le debe");
  ok(v({ monto: 5000, desde: "2026-10-01", hasta: "2026-10-07", nota: "primera semana" }, 13000).ok, "pagar una parte, con período y nota");
  ok(!v({ monto: 13001 }, 13000).ok, "no se puede pagar de más");
  ok(!v({ monto: 1000, desde: "2026-10-08", hasta: "2026-10-01" }, 13000).ok, "período al revés se rechaza");

  window.log("\naciertos: " + window.__aciertos + " · fallas: " + window.__fallas);
  window.__listo = true;
})().catch((e) => { document.getElementById("salida").textContent += "\nERROR: " + (e && e.stack || e); window.__listo = true; window.__fallas = (window.__fallas || 0) + 1; });
