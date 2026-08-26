/**
 * Pruebas del analista comercial.
 *
 * Se ejecutan sobre el archivo REAL compilado, no sobre una copia. Lo que más
 * importa acá no es que encuentre patrones cuando los hay —eso es fácil— sino
 * que NO los invente cuando no los hay. Un analista que ve figuras en el ruido
 * es peor que no tener analista, porque el dueño le cree.
 *
 *   npx tsc src/lib/analista.ts --ignoreConfig --outDir /tmp/an --target es2020 \
 *       --module esnext --moduleResolution bundler --skipLibCheck
 *   mv /tmp/an/analista.js /tmp/an/analista.mjs
 *   node pruebas/analista.mjs
 */

import {
  analizar,
  MINIMO_PARA_OPINAR,
  horaLocal,
  diaLocal,
  elegirIdeaDeLaSemana,
  lunesDeLaSemana,
} from "/tmp/an/analista.mjs";

const ZONA = "America/Asuncion";
const AHORA = new Date("2026-08-25T15:00:00Z");

let bien = 0;
let mal = 0;
const fallos = [];

function afirmar(nombre, condicion, detalle = "") {
  if (condicion) {
    bien++;
  } else {
    mal++;
    fallos.push(nombre + (detalle ? "  -> " + detalle : ""));
  }
  console.log(`  ${condicion ? "OK   " : "MAL  "} ${nombre}${condicion || !detalle ? "" : "  -> " + detalle}`);
}

function seccion(titulo) {
  console.log("\n" + titulo);
}

// --- generador determinista, sin Math.random para que la prueba sea repetible ---
let semilla = 12345;
function pseudoAzar() {
  semilla = (semilla * 1103515245 + 12345) % 2147483648;
  return semilla / 2147483648;
}

function hacerPedido({
  id,
  diasAtras = 1,
  horaUTC = 22,
  enviado = true,
  estado = "entregado",
  tipoEntrega = "delivery",
  total = 60000,
  costoEnvio = 10000,
  telefono = "0981000001",
  nombre = "Cliente",
  items = [],
}) {
  const creado = new Date(AHORA.getTime() - diasAtras * 86400000);
  creado.setUTCHours(horaUTC, 0, 0, 0);
  return {
    id,
    creado,
    estado,
    enviado,
    tipoEntrega,
    total,
    costoEnvio,
    clienteNombre: nombre,
    clienteTelefono: telefono,
    items,
  };
}

function hacerProducto({
  id,
  nombre,
  categoriaId = "c1",
  categoriaNombre = "Pizzas",
  precio = 55000,
  costo = null,
  disponible = true,
  diasEnCarta = 120,
}) {
  return {
    id,
    nombre,
    categoriaId,
    categoriaNombre,
    precio,
    costo,
    disponible,
    creado: new Date(AHORA.getTime() - diasEnCarta * 86400000),
  };
}

const item = (productId, nombre, cantidad = 1, precio = 55000) => ({
  productId,
  nombre,
  cantidad,
  precioUnitario: precio,
});

const claves = (r) => r.ideas.map((i) => i.clave);

// ===========================================================================
seccion("1. Callar cuando no alcanza — lo más importante");
// ===========================================================================

{
  const pedidos = Array.from({ length: 10 }, (_, i) =>
    hacerPedido({ id: "p" + i, items: [item("a", "Muzzarella")] })
  );
  const r = analizar({ pedidos, productos: [], ahora: AHORA, zona: ZONA });
  afirmar("con 10 pedidos no emite ninguna idea", r.ideas.length === 0, `emitió ${r.ideas.length}`);
  afirmar("avisa cuántos pedidos faltan", r.faltaData?.pedidosNecesarios === MINIMO_PARA_OPINAR);
  afirmar("informa los que ya tiene", r.faltaData?.pedidosActuales === 10);
}

{
  const r = analizar({ pedidos: [], productos: [], ahora: AHORA, zona: ZONA });
  afirmar("sin ningún pedido no revienta", r.ideas.length === 0 && r.base === 0);
}

{
  // 40 pedidos, pero 25 nunca se enviaron: la base real son 15, no alcanza.
  const pedidos = [
    ...Array.from({ length: 15 }, (_, i) =>
      hacerPedido({ id: "e" + i, enviado: true, items: [item("a", "Muzzarella")] })
    ),
    ...Array.from({ length: 25 }, (_, i) =>
      hacerPedido({ id: "n" + i, enviado: false, items: [item("a", "Muzzarella")] })
    ),
  ];
  const r = analizar({ pedidos, productos: [], ahora: AHORA, zona: ZONA });
  afirmar(
    "los carritos abandonados NO cuentan como venta para la base",
    r.ideas.length === 0 && r.base === 15,
    `base=${r.base}`
  );
}

{
  // Cancelados tampoco.
  const pedidos = Array.from({ length: 45 }, (_, i) =>
    hacerPedido({ id: "c" + i, estado: i < 30 ? "cancelado" : "entregado", items: [item("a", "M")] })
  );
  const r = analizar({ pedidos, productos: [], ahora: AHORA, zona: ZONA });
  afirmar("los cancelados no cuentan como venta", r.base === 15 && r.ideas.length === 0, `base=${r.base}`);
}

// ===========================================================================
seccion("2. No inventar patrones donde no los hay");
// ===========================================================================

{
  // 300 pedidos repartidos parejo entre horas, días, productos y clientes.
  // Un analista honesto no debería encontrar acá ni franja floja, ni día
  // flojo, ni combo, ni producto dormido.
  const productos = ["a", "b", "c", "d", "e"].map((id) =>
    hacerProducto({ id, nombre: "Producto " + id.toUpperCase() })
  );
  const pedidos = [];
  for (let i = 0; i < 300; i++) {
    const p = ["a", "b", "c", "d", "e"][i % 5];
    pedidos.push(
      hacerPedido({
        id: "u" + i,
        diasAtras: (i % 28) + 1,
        horaUTC: 16 + (i % 7),
        telefono: "09810" + String(i % 60).padStart(5, "0"),
        items: [item(p, "Producto " + p.toUpperCase())],
      })
    );
  }
  const r = analizar({ pedidos, productos, ahora: AHORA, zona: ZONA });
  const k = claves(r);

  afirmar("con datos parejos NO inventa una franja floja", !k.includes("franja"), k.join(", "));
  afirmar("con datos parejos NO inventa un día flojo", !k.includes("dia"), k.join(", "));
  afirmar("sin pares repetidos NO inventa un combo", !k.includes("combo"), k.join(", "));
  afirmar("si todo se vende NO marca productos dormidos", !k.includes("dormidos"), k.join(", "));
  afirmar("sin costos cargados NO opina de margen", !k.includes("margen"), k.join(", "));
  afirmar("igual entrega el resumen", k.includes("resumen"));
}

{
  // Ruido pseudoaleatorio: tampoco debería sacar conclusiones fuertes.
  const productos = ["a", "b", "c", "d", "e", "f"].map((id) =>
    hacerProducto({ id, nombre: "P" + id })
  );
  const pedidos = [];
  for (let i = 0; i < 400; i++) {
    const cuantos = 1 + Math.floor(pseudoAzar() * 2);
    const items = [];
    for (let j = 0; j < cuantos; j++) {
      const idx = Math.floor(pseudoAzar() * 6);
      const id = ["a", "b", "c", "d", "e", "f"][idx];
      items.push(item(id, "P" + id));
    }
    pedidos.push(
      hacerPedido({
        id: "r" + i,
        diasAtras: 1 + Math.floor(pseudoAzar() * 28),
        horaUTC: 15 + Math.floor(pseudoAzar() * 8),
        telefono: "0982" + String(Math.floor(pseudoAzar() * 80)).padStart(6, "0"),
        items,
      })
    );
  }
  const r = analizar({ pedidos, productos, ahora: AHORA, zona: ZONA });
  const k = claves(r);
  afirmar("sobre ruido no afirma un combo", !k.includes("combo"), k.join(", "));
  afirmar("sobre ruido no marca productos dormidos", !k.includes("dormidos"), k.join(", "));
}

// ===========================================================================
seccion("3. Encontrar lo que SÍ está");
// ===========================================================================

{
  // Franja fuerte a las 21 local, franja muy floja a las 15 local.
  // Asunción es UTC-3, así que 21 local = 00 UTC del día siguiente y
  // 15 local = 18 UTC. Se usan horas UTC que caen claramente en cada franja.
  const productos = ["a", "b", "c", "d", "e"].map((id) => hacerProducto({ id, nombre: "P" + id }));
  const pedidos = [];
  // Un local real abre varias horas. Se reparte la actividad entre seis
  // franjas, con las 20:00 locales muy fuertes y las 15:00 casi muertas.
  const carga = { 18: 3, 19: 8, 20: 14, 21: 20, 22: 30, 23: 60 };
  let n = 0;
  for (const [horaUTC, cuantos] of Object.entries(carga)) {
    for (let i = 0; i < cuantos; i++) {
      pedidos.push(
        hacerPedido({
          id: "f" + n++,
          diasAtras: (n % 20) + 1,
          horaUTC: Number(horaUTC),
          telefono: "0983" + String(n).padStart(6, "0"),
          items: [item("a", "Pa")],
        })
      );
    }
  }
  const r = analizar({ pedidos, productos, ahora: AHORA, zona: ZONA });
  const franja = r.ideas.find((i) => i.clave === "franja");
  afirmar("detecta la franja floja cuando la diferencia es real", !!franja);
  if (franja) {
    afirmar("y nombra la franja fuerte correcta (20:00)", franja.dato.includes("20:00"), franja.dato);
  }
}

{
  // Combo real: siempre que se pide Napolitana, se pide Coca.
  const productos = [
    hacerProducto({ id: "nap", nombre: "Napolitana" }),
    hacerProducto({ id: "coca", nombre: "Coca Cola", categoriaId: "c2", categoriaNombre: "Bebidas", precio: 15000 }),
    hacerProducto({ id: "muz", nombre: "Muzzarella" }),
    hacerProducto({ id: "emp", nombre: "Empanada" }),
    hacerProducto({ id: "agua", nombre: "Agua", categoriaId: "c2", categoriaNombre: "Bebidas" }),
  ];
  const pedidos = [];
  for (let i = 0; i < 30; i++) {
    pedidos.push(
      hacerPedido({
        id: "cb" + i,
        diasAtras: (i % 20) + 1,
        telefono: "0985" + String(i).padStart(6, "0"),
        items: [item("nap", "Napolitana"), item("coca", "Coca Cola", 1, 15000)],
      })
    );
  }
  for (let i = 0; i < 30; i++) {
    pedidos.push(
      hacerPedido({
        id: "cm" + i,
        diasAtras: (i % 20) + 1,
        telefono: "0986" + String(i).padStart(6, "0"),
        items: [item("muz", "Muzzarella")],
      })
    );
  }
  const r = analizar({ pedidos, productos, ahora: AHORA, zona: ZONA });
  const combo = r.ideas.find((i) => i.clave === "combo");
  afirmar("detecta el combo real", !!combo);
  if (combo) {
    afirmar(
      "nombra los dos productos correctos",
      combo.dato.includes("Napolitana") && combo.dato.includes("Coca Cola"),
      combo.dato
    );
  }
}

{
  // Productos dormidos reales.
  const productos = [
    hacerProducto({ id: "v1", nombre: "Se vende bien" }),
    hacerProducto({ id: "v2", nombre: "Tambien se vende" }),
    hacerProducto({ id: "d1", nombre: "Dormido uno" }),
    hacerProducto({ id: "d2", nombre: "Dormido dos" }),
    hacerProducto({ id: "d3", nombre: "Dormido tres" }),
    hacerProducto({ id: "nuevo", nombre: "Recien puesto", diasEnCarta: 5 }),
  ];
  const pedidos = Array.from({ length: 50 }, (_, i) =>
    hacerPedido({
      id: "dp" + i,
      diasAtras: (i % 20) + 1,
      telefono: "0987" + String(i).padStart(6, "0"),
      items: [item(i % 2 ? "v1" : "v2", i % 2 ? "Se vende bien" : "Tambien se vende")],
    })
  );
  const r = analizar({ pedidos, productos, ahora: AHORA, zona: ZONA });
  const dormidos = r.ideas.find((i) => i.clave === "dormidos");
  afirmar("detecta los productos que no se venden", !!dormidos);
  if (dormidos) {
    const listados = dormidos.detalle.map((d) => d.etiqueta);
    afirmar("lista los tres dormidos", listados.length === 3, listados.join(", "));
    afirmar(
      "NO acusa al producto recién puesto en la carta",
      !listados.includes("Recien puesto"),
      listados.join(", ")
    );
  }
}

{
  // Clientes perdidos reales.
  const productos = [hacerProducto({ id: "a", nombre: "Pa" })];
  const pedidos = [];
  // 20 clientes activos, con dos pedidos recientes cada uno
  for (let c = 0; c < 20; c++) {
    for (let n = 0; n < 2; n++) {
      pedidos.push(
        hacerPedido({
          id: `act${c}_${n}`,
          diasAtras: 3 + n,
          telefono: "0991" + String(c).padStart(6, "0"),
          nombre: "Activo " + c,
          items: [item("a", "Pa")],
        })
      );
    }
  }
  // 5 clientes que eran habituales y hace 90 días que no vuelven
  for (let c = 0; c < 5; c++) {
    for (let n = 0; n < 3; n++) {
      pedidos.push(
        hacerPedido({
          id: `perd${c}_${n}`,
          diasAtras: 90 + n,
          telefono: "0992" + String(c).padStart(6, "0"),
          nombre: "Perdido " + c,
          items: [item("a", "Pa")],
        })
      );
    }
  }
  // 3 que pidieron una sola vez hace mucho: NO son "habituales que se fueron"
  for (let c = 0; c < 3; c++) {
    pedidos.push(
      hacerPedido({
        id: "unico" + c,
        diasAtras: 100,
        telefono: "0993" + String(c).padStart(6, "0"),
        nombre: "Unico " + c,
        items: [item("a", "Pa")],
      })
    );
  }
  const r = analizar({ pedidos, productos, ahora: AHORA, zona: ZONA });
  const perdidos = r.ideas.find((i) => i.clave === "clientes_perdidos");
  afirmar("detecta a los clientes habituales que se fueron", !!perdidos);
  if (perdidos) {
    afirmar("son exactamente 5", perdidos.dato.includes("5 personas"), perdidos.dato);
    const listados = perdidos.detalle.map((d) => d.etiqueta).join(" ");
    afirmar("no cuenta a los que pidieron una sola vez", !listados.includes("Unico"), listados);
  }
}

{
  // Margen: el que más factura no es el que más deja.
  const productos = [
    hacerProducto({ id: "cara", nombre: "Pizza Premium", precio: 100000, costo: 85000 }),
    hacerProducto({ id: "buena", nombre: "Empanada", precio: 12000, costo: 3000, categoriaId: "c3", categoriaNombre: "Empanadas" }),
    hacerProducto({ id: "otra", nombre: "Gaseosa", precio: 15000, costo: 9000, categoriaId: "c2", categoriaNombre: "Bebidas" }),
  ];
  const pedidos = [];
  for (let i = 0; i < 40; i++) {
    pedidos.push(
      hacerPedido({
        id: "mg" + i,
        diasAtras: (i % 20) + 1,
        telefono: "0994" + String(i).padStart(6, "0"),
        items: [item("cara", "Pizza Premium", 5, 100000)],
      })
    );
  }
  for (let i = 0; i < 40; i++) {
    pedidos.push(
      hacerPedido({
        id: "me" + i,
        diasAtras: (i % 20) + 1,
        telefono: "0995" + String(i).padStart(6, "0"),
        items: [item("buena", "Empanada", 10, 12000)],
      })
    );
  }
  const r = analizar({ pedidos, productos, ahora: AHORA, zona: ZONA });
  const margen = r.ideas.find((i) => i.clave === "margen");
  afirmar("detecta que el que más factura no es el que más deja", !!margen);
  if (margen) {
    afirmar("señala la empanada como la que más margen deja", margen.dato.includes("Empanada"), margen.dato);
  }
}

{
  // Límite: si el negocio costeó productos pero solo UNO se vendió, no hay
  // comparación posible y el analista tiene que callarse.
  const productos = [
    hacerProducto({ id: "uno", nombre: "El unico que se vende", precio: 50000, costo: 20000 }),
    hacerProducto({ id: "dos", nombre: "Nunca se vende", precio: 30000, costo: 10000 }),
    hacerProducto({ id: "tres", nombre: "Tampoco", precio: 20000, costo: 5000 }),
  ];
  const pedidos = Array.from({ length: 40 }, (_, i) =>
    hacerPedido({
      id: "un" + i,
      diasAtras: (i % 20) + 1,
      telefono: "0999" + String(i).padStart(6, "0"),
      items: [item("uno", "El unico que se vende", 1, 50000)],
    })
  );
  const r = analizar({ pedidos, productos, ahora: AHORA, zona: ZONA });
  afirmar(
    "con un solo producto vendido NO compara márgenes",
    !r.ideas.some((i) => i.clave === "margen"),
    claves(r).join(", ")
  );
}

{
  // Y si el negocio solo costeó UN producto, tampoco: sería el único medido.
  const productos = [
    hacerProducto({ id: "a", nombre: "Con costo", precio: 50000, costo: 20000 }),
    hacerProducto({ id: "b", nombre: "Sin costo", precio: 30000 }),
    hacerProducto({ id: "c", nombre: "Sin costo dos", precio: 20000 }),
  ];
  const pedidos = Array.from({ length: 40 }, (_, i) =>
    hacerPedido({
      id: "sc" + i,
      diasAtras: (i % 20) + 1,
      telefono: "0977" + String(i).padStart(6, "0"),
      items: [item(i % 2 ? "a" : "b", i % 2 ? "Con costo" : "Sin costo")],
    })
  );
  const r = analizar({ pedidos, productos, ahora: AHORA, zona: ZONA });
  afirmar(
    "con un solo producto costeado NO opina de margen",
    !r.ideas.some((i) => i.clave === "margen"),
    claves(r).join(", ")
  );
}

{
  // Carritos abandonados.
  const pedidos = [
    ...Array.from({ length: 60 }, (_, i) =>
      hacerPedido({ id: "ok" + i, enviado: true, telefono: "0996" + i, items: [item("a", "Pa")] })
    ),
    ...Array.from({ length: 40 }, (_, i) =>
      hacerPedido({ id: "ab" + i, enviado: false, telefono: "0997" + i, items: [item("a", "Pa")] })
    ),
  ];
  const r = analizar({ pedidos, productos: [], ahora: AHORA, zona: ZONA });
  const ab = r.ideas.find((i) => i.clave === "abandono");
  afirmar("detecta los carritos abandonados", !!ab);
  if (ab) afirmar("calcula bien el 40%", ab.dato.includes("40%"), ab.dato);
}

// ===========================================================================
seccion("4. Coherencia de lo que devuelve");
// ===========================================================================

{
  const productos = ["a", "b", "c", "d", "e"].map((id) => hacerProducto({ id, nombre: "P" + id }));
  const pedidos = Array.from({ length: 120 }, (_, i) =>
    hacerPedido({
      id: "co" + i,
      diasAtras: (i % 25) + 1,
      horaUTC: 20 + (i % 4),
      telefono: "0998" + String(i % 40).padStart(6, "0"),
      items: [item(["a", "b", "c", "d", "e"][i % 5], "P" + ["a", "b", "c", "d", "e"][i % 5])],
    })
  );
  const r = analizar({ pedidos, productos, ahora: AHORA, zona: ZONA });

  afirmar("ninguna idea sale sin su dato de respaldo", r.ideas.every((i) => i.dato.trim().length > 0));
  afirmar("ninguna idea sale sin acción concreta", r.ideas.every((i) => i.accion.trim().length > 0));
  afirmar(
    "toda idea declara su confianza",
    r.ideas.every((i) => ["alta", "media", "baja"].includes(i.confianza))
  );
  afirmar("no hay claves repetidas", new Set(claves(r)).size === claves(r).length);
  afirmar("el resumen aparece siempre", claves(r).includes("resumen"));
}

// ===========================================================================
seccion("5. Zona horaria de Asunción");
// ===========================================================================

{
  // 2026-08-25T23:30Z = 20:30 en Asunción (UTC-3)
  afirmar("convierte bien la hora UTC a hora local", horaLocal(new Date("2026-08-25T23:30:00Z"), ZONA) === 20);
  // 2026-08-26T02:00Z = 23:00 del 25 en Asunción -> martes
  afirmar(
    "un pedido de la madrugada UTC cuenta para el día local anterior",
    diaLocal(new Date("2026-08-26T02:00:00Z"), ZONA) === 2
  );
  afirmar("medianoche local se lee como hora 0", horaLocal(new Date("2026-08-26T03:00:00Z"), ZONA) === 0);
}

// ===========================================================================
seccion("6. La idea de la semana");
// ===========================================================================

{
  const idea = (clave, tipo, confianza = "alta") => ({
    clave,
    tipo,
    titulo: clave,
    dato: "x",
    accion: "y",
    confianza,
  });

  const todas = [
    idea("resumen", "dato"),
    idea("clientes_fieles", "dato"),
    idea("franja", "oportunidad"),
    idea("abandono", "alerta"),
    idea("dormidos", "alerta", "media"),
  ];

  const elegida = elegirIdeaDeLaSemana(todas, []);
  afirmar("elige una alerta antes que una oportunidad", elegida.clave === "abandono", elegida.clave);
  afirmar(
    "entre dos alertas elige la mejor respaldada",
    elegirIdeaDeLaSemana([idea("dormidos", "alerta", "media"), idea("abandono", "alerta", "alta")], []).clave ===
      "abandono"
  );
  afirmar(
    "el resumen nunca puede ser la idea de la semana",
    elegirIdeaDeLaSemana([idea("resumen", "dato")], []) === null
  );
  afirmar(
    "no repite lo de la semana pasada",
    elegirIdeaDeLaSemana(todas, ["abandono"]).clave === "dormidos",
    elegirIdeaDeLaSemana(todas, ["abandono"]).clave
  );
  afirmar(
    "si ya se usaron todas, igual devuelve la más importante",
    elegirIdeaDeLaSemana(todas, ["abandono", "dormidos", "franja", "clientes_fieles"]).clave === "abandono"
  );
  afirmar("sin ideas devuelve null", elegirIdeaDeLaSemana([], []) === null);

  // El desempate tiene que ser estable: la misma entrada en distinto orden
  // debe dar SIEMPRE la misma idea, o cambiaría sola entre dos ejecuciones.
  const a = elegirIdeaDeLaSemana([idea("zzz", "alerta"), idea("aaa", "alerta")], []);
  const b = elegirIdeaDeLaSemana([idea("aaa", "alerta"), idea("zzz", "alerta")], []);
  afirmar("el desempate es estable, no depende del orden de entrada", a.clave === b.clave, `${a.clave} vs ${b.clave}`);
}

{
  // 2026-08-25 es martes. Su lunes es el 24.
  afirmar(
    "un martes pertenece a la semana de su lunes",
    lunesDeLaSemana(new Date("2026-08-25T15:00:00Z"), ZONA) === "2026-08-24",
    lunesDeLaSemana(new Date("2026-08-25T15:00:00Z"), ZONA)
  );
  // El propio lunes 24 se mapea a sí mismo.
  afirmar(
    "el lunes se mapea a sí mismo",
    lunesDeLaSemana(new Date("2026-08-24T13:00:00Z"), ZONA) === "2026-08-24"
  );
  // Domingo 30 pertenece a la semana que arrancó el lunes 24, no a la del 31.
  afirmar(
    "el domingo cierra la semana, no abre la siguiente",
    lunesDeLaSemana(new Date("2026-08-30T15:00:00Z"), ZONA) === "2026-08-24",
    lunesDeLaSemana(new Date("2026-08-30T15:00:00Z"), ZONA)
  );
  // Lunes 31 ya es semana nueva.
  afirmar(
    "el lunes siguiente abre semana nueva",
    lunesDeLaSemana(new Date("2026-08-31T13:00:00Z"), ZONA) === "2026-08-31"
  );
  // 2026-08-31T02:00Z son las 23:00 del domingo 30 en Asunción: semana vieja.
  afirmar(
    "la madrugada UTC del lunes todavía es domingo en Asunción",
    lunesDeLaSemana(new Date("2026-08-31T02:00:00Z"), ZONA) === "2026-08-24",
    lunesDeLaSemana(new Date("2026-08-31T02:00:00Z"), ZONA)
  );
  // Dos momentos del mismo lunes tienen que caer en la misma semana.
  afirmar(
    "dos ejecuciones del mismo lunes dan la misma semana",
    lunesDeLaSemana(new Date("2026-08-24T10:05:00Z"), ZONA) ===
      lunesDeLaSemana(new Date("2026-08-24T10:58:00Z"), ZONA)
  );
}

console.log(`\n  TOTAL: ${bien} bien, ${mal} mal`);
if (fallos.length) {
  console.log("\n  Fallaron:");
  for (const f of fallos) console.log("    - " + f);
}
process.exit(mal ? 1 : 0);
