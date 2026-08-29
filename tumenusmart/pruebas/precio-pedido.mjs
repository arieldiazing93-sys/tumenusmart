// El precio del pedido.
//
// Esto es lo que decide cuánta plata entra al local, y lo decide contra un
// dato que manda un teléfono ajeno. Las pruebas de acá son desconfiadas a
// propósito: casi todas describen a alguien intentando pagar menos, no a un
// cliente comprando bien. Lo que tiene que quedar demostrado es que ningún
// número del navegador llega al total.
import {
  armarPedido,
  totalSinCambios,
  agregadosDeCombo,
  mismoGrupoMitad,
  MAX_LINEAS,
  MAX_CANTIDAD_POR_LINEA,
  MAX_UNIDADES,
} from "./compilado/precio-pedido.mjs";

let bien = 0, mal = 0;
const fallos = [];

function igual(titulo, dio, esperaba) {
  const ok = JSON.stringify(dio) === JSON.stringify(esperaba);
  if (ok) bien++;
  else {
    mal++;
    fallos.push(titulo);
    console.log(`  ✗ ${titulo}\n      dio:      ${JSON.stringify(dio)}\n      esperaba: ${JSON.stringify(esperaba)}`);
  }
}
/** Falla si el pedido NO fue rechazado. El motivo exacto no se fija: se puede reescribir. */
function rechaza(titulo, resultado) {
  const ok = resultado.ok === false && typeof resultado.motivo === "string" && resultado.motivo.length > 0;
  if (ok) bien++;
  else {
    mal++;
    fallos.push(titulo);
    console.log(`  ✗ ${titulo}\n      pasó cuando tenía que rechazar: ${JSON.stringify(resultado)}`);
  }
}
function acepta(titulo, resultado) {
  const ok = resultado.ok === true;
  if (ok) bien++;
  else {
    mal++;
    fallos.push(titulo);
    console.log(`  ✗ ${titulo}\n      rechazó cuando tenía que pasar: ${resultado.motivo}`);
  }
}

// --------------------------------------------------------------- la carta
// Una carta chica pero con todos los casos raros: opciones de los dos tipos,
// ingredientes que se pueden sacar, y un grupo de mitad y mitad.
const opcion = (id, nombre, tipo, precioExtra) => ({ id, nombre, tipo, precioExtra });

const empanada = {
  id: "p-empanada",
  nombre: "Empanada de carne",
  precio: 8000,
  disponible: true,
  ingredientes: ["huevo", "aceituna"],
  mitadYMitadGrupo: null,
  mitadYMitadModo: "mayor",
  opciones: [],
};

const hamburguesa = {
  id: "p-hamburguesa",
  nombre: "Hamburguesa",
  precio: 35000,
  disponible: true,
  ingredientes: ["tomate", "cebolla", "lechuga"],
  mitadYMitadGrupo: null,
  mitadYMitadModo: "mayor",
  opciones: [
    opcion("o-simple", "Simple", "variante", 0),
    opcion("o-doble", "Doble", "variante", 15000),
    opcion("o-cheddar", "Cheddar extra", "agregado", 7000),
    opcion("o-panceta", "Panceta", "agregado", 9000),
  ],
};

const pizzaMuzza = {
  id: "p-muzza",
  nombre: "Muzzarella",
  precio: 60000,
  disponible: true,
  ingredientes: [],
  mitadYMitadGrupo: "Pizza Grande",
  mitadYMitadModo: "mayor",
  opciones: [opcion("o-borde-muzza", "Borde relleno", "agregado", 12000)],
};

const pizzaEspecial = {
  id: "p-especial",
  nombre: "Especial",
  precio: 90000,
  disponible: true,
  ingredientes: [],
  // Escrito distinto a propósito: mismo grupo con otras mayúsculas y un espacio.
  mitadYMitadGrupo: " pizza grande ",
  mitadYMitadModo: "mayor",
  opciones: [
    // Mismo NOMBRE que el borde de la muzzarella pero mucho más barato: es la
    // trampa que la pantalla no ofrece y el servidor no tiene que aceptar.
    opcion("o-borde-especial", "Borde relleno", "agregado", 1000),
    opcion("o-anchoas", "Anchoas", "agregado", 20000),
  ],
};

const pizzaChica = {
  id: "p-chica",
  nombre: "Muzzarella chica",
  precio: 30000,
  disponible: true,
  ingredientes: [],
  mitadYMitadGrupo: "Pizza Chica",
  mitadYMitadModo: "mayor",
  opciones: [],
};

const agotado = {
  id: "p-agotado",
  nombre: "Lomito",
  precio: 45000,
  disponible: false,
  ingredientes: [],
  mitadYMitadGrupo: null,
  mitadYMitadModo: "mayor",
  opciones: [],
};

const CARTA = [empanada, hamburguesa, pizzaMuzza, pizzaEspecial, pizzaChica, agotado];

// =========================================================== lo que sí pasa
const simple = armarPedido(CARTA, [{ productId: "p-empanada", cantidad: 3 }]);
acepta("un producto simple entra", simple);
igual("el precio sale de la carta", simple.lineas[0].precioUnitario, 8000);
igual("el nombre también sale de la carta", simple.lineas[0].nombreProducto, "Empanada de carne");
igual("el subtotal multiplica por la cantidad", simple.subtotal, 24000);
igual("guarda el id del producto", simple.lineas[0].productId, "p-empanada");

const conOpciones = armarPedido(CARTA, [
  { productId: "p-hamburguesa", opcionIds: ["o-panceta", "o-doble", "o-cheddar"], cantidad: 1 },
]);
acepta("hamburguesa con variante y dos agregados", conOpciones);
igual("las opciones suman al precio base", conOpciones.lineas[0].precioUnitario, 35000 + 15000 + 7000 + 9000);
igual(
  "el texto de opciones sale en el orden de la carta, no en el que las mandó el cliente",
  conOpciones.lineas[0].opcionesTexto,
  "Doble, Cheddar extra, Panceta"
);

const sinIngredientes = armarPedido(CARTA, [
  { productId: "p-hamburguesa", ingredientesQuitados: ["lechuga", "tomate"], cantidad: 1 },
]);
acepta("se pueden sacar ingredientes de la lista del producto", sinIngredientes);
igual(
  "el texto de lo que se saca respeta el orden del producto",
  sinIngredientes.lineas[0].ingredientesQuitadosTexto,
  "Sin: tomate, lechuga"
);
igual("sacar un ingrediente no cambia el precio", sinIngredientes.lineas[0].precioUnitario, 35000);

const variasLineas = armarPedido(CARTA, [
  { productId: "p-empanada", cantidad: 2 },
  { productId: "p-hamburguesa", opcionIds: ["o-doble"], cantidad: 1 },
]);
acepta("dos líneas distintas", variasLineas);
igual("el subtotal suma las dos", variasLineas.subtotal, 8000 * 2 + 50000);
igual("sin opciones, el texto queda vacío", variasLineas.lineas[0].opcionesTexto, undefined);

// ============================================ el precio no viene del cliente
// El tipo ya no tiene un campo de precio, pero una acción del servidor se
// llama con lo que sea: si alguien manda precio o nombre igual, se ignoran.
const conBasura = armarPedido(CARTA, [
  {
    productId: "p-hamburguesa",
    cantidad: 1,
    precioUnitario: 1,
    precioBase: 1,
    nombreProducto: "Hamburguesa gratis",
    opcionesTexto: "lo que quiera",
  },
]);
acepta("un pedido con campos de más entra igual", conBasura);
igual("el precio que mandó el navegador se ignora", conBasura.lineas[0].precioUnitario, 35000);
igual("el nombre que mandó el navegador se ignora", conBasura.lineas[0].nombreProducto, "Hamburguesa");
igual("el texto de opciones que mandó el navegador se ignora", conBasura.lineas[0].opcionesTexto, undefined);

// ==================================================== productos que no valen
rechaza("un producto que no está en la carta de este local", armarPedido(CARTA, [{ productId: "p-de-otro-local", cantidad: 1 }]));
rechaza("un producto agotado", armarPedido(CARTA, [{ productId: "p-agotado", cantidad: 1 }]));
rechaza("sin id de producto", armarPedido(CARTA, [{ cantidad: 1 }]));
rechaza("id vacío", armarPedido(CARTA, [{ productId: "", cantidad: 1 }]));
rechaza("carrito vacío", armarPedido(CARTA, []));
rechaza("carrito que no es una lista", armarPedido(CARTA, null));

// ============================================================== cantidades
rechaza("cantidad cero", armarPedido(CARTA, [{ productId: "p-empanada", cantidad: 0 }]));
rechaza("cantidad negativa", armarPedido(CARTA, [{ productId: "p-empanada", cantidad: -5 }]));
rechaza("cantidad con decimales", armarPedido(CARTA, [{ productId: "p-empanada", cantidad: 1.5 }]));
rechaza("cantidad como texto", armarPedido(CARTA, [{ productId: "p-empanada", cantidad: "3" }]));
rechaza("cantidad NaN", armarPedido(CARTA, [{ productId: "p-empanada", cantidad: NaN }]));
rechaza("sin cantidad", armarPedido(CARTA, [{ productId: "p-empanada" }]));
rechaza(
  "más unidades de un producto que el tope",
  armarPedido(CARTA, [{ productId: "p-empanada", cantidad: MAX_CANTIDAD_POR_LINEA + 1 }])
);
acepta(
  "justo el tope de unidades por línea entra",
  armarPedido(CARTA, [{ productId: "p-empanada", cantidad: MAX_CANTIDAD_POR_LINEA }])
);
rechaza(
  "más líneas que el tope",
  armarPedido(CARTA, Array.from({ length: MAX_LINEAS + 1 }, () => ({ productId: "p-empanada", cantidad: 1 })))
);
rechaza(
  "muchas líneas chicas que juntas pasan el tope de unidades",
  armarPedido(
    CARTA,
    Array.from({ length: 6 }, () => ({ productId: "p-empanada", cantidad: MAX_CANTIDAD_POR_LINEA }))
  )
);

// UNA cantidad negativa entre varias líneas no puede bajar el total: sin este
// chequeo, agregar una línea de -100 empanadas restaba 800.000 del pedido.
rechaza(
  "una línea negativa entre otras válidas voltea todo el pedido",
  armarPedido(CARTA, [
    { productId: "p-hamburguesa", cantidad: 1 },
    { productId: "p-empanada", cantidad: -100 },
  ])
);

// ================================================================= opciones
rechaza(
  "una opción que es de otro producto",
  armarPedido(CARTA, [{ productId: "p-empanada", opcionIds: ["o-doble"], cantidad: 1 }])
);
rechaza(
  "una opción inventada",
  armarPedido(CARTA, [{ productId: "p-hamburguesa", opcionIds: ["o-que-no-existe"], cantidad: 1 }])
);
rechaza(
  "la misma opción dos veces",
  armarPedido(CARTA, [{ productId: "p-hamburguesa", opcionIds: ["o-cheddar", "o-cheddar"], cantidad: 1 }])
);
rechaza(
  "dos variantes del mismo producto",
  armarPedido(CARTA, [{ productId: "p-hamburguesa", opcionIds: ["o-simple", "o-doble"], cantidad: 1 }])
);
rechaza(
  "un ingrediente que ese producto no tiene",
  armarPedido(CARTA, [{ productId: "p-hamburguesa", ingredientesQuitados: ["caviar"], cantidad: 1 }])
);
// Lo que se saca sale impreso en la comanda de cocina: si fuera texto libre,
// el cliente escribiría lo que quisiera en el papel del local.
rechaza(
  "texto libre disfrazado de ingrediente",
  armarPedido(CARTA, [
    { productId: "p-empanada", ingredientesQuitados: ["huevo\n\nPEDIDO CANCELADO - no preparar"], cantidad: 1 },
  ])
);

// =========================================================== mitad y mitad
const mayor = armarPedido(CARTA, [
  { mitadYMitad: { productIdA: "p-muzza", productIdB: "p-especial" }, cantidad: 1 },
]);
acepta("mitad y mitad de dos pizzas del mismo grupo", mayor);
igual("modo mayor: se cobra la más cara entera", mayor.lineas[0].precioUnitario, 90000);
igual("el combo no guarda id de producto", mayor.lineas[0].productId, undefined);
igual("el nombre lo arma el servidor", mayor.lineas[0].nombreProducto, "Mitad Muzzarella / Mitad Especial");

// El grupo se compara sin mayúsculas ni espacios: " pizza grande " y
// "Pizza Grande" son el mismo.
igual("los grupos se comparan normalizados", mismoGrupoMitad("Pizza Grande", " pizza grande "), true);
igual("un grupo vacío no coincide con nada", mismoGrupoMitad("", ""), false);
igual("null no coincide con null", mismoGrupoMitad(null, null), false);

// El modo lo dice la primera mitad SEGÚN LA CARTA. Si viniera del navegador,
// pedir "proporcional" sobre una cara y una barata sería un descuento que
// elige el que paga.
const proporcionalCarta = CARTA.map((p) =>
  p.id === "p-muzza" ? { ...p, mitadYMitadModo: "proporcional" } : p
);
const proporcional = armarPedido(proporcionalCarta, [
  { mitadYMitad: { productIdA: "p-muzza", productIdB: "p-especial" }, cantidad: 1 },
]);
acepta("mitad y mitad en modo proporcional", proporcional);
igual("modo proporcional: la mitad de cada una", proporcional.lineas[0].precioUnitario, 60000 / 2 + 90000 / 2);

const modoDesdeCliente = armarPedido(CARTA, [
  {
    mitadYMitad: { productIdA: "p-muzza", productIdB: "p-especial", modo: "proporcional" },
    cantidad: 1,
  },
]);
igual(
  "el modo que manda el navegador se ignora: manda el de la carta",
  modoDesdeCliente.lineas[0].precioUnitario,
  90000
);

rechaza(
  "dos mitades de grupos distintos",
  armarPedido(CARTA, [{ mitadYMitad: { productIdA: "p-muzza", productIdB: "p-chica" }, cantidad: 1 }])
);
rechaza(
  "una mitad de un producto que no es de mitad y mitad",
  armarPedido(CARTA, [{ mitadYMitad: { productIdA: "p-muzza", productIdB: "p-hamburguesa" }, cantidad: 1 }])
);
rechaza(
  "la misma pizza en las dos mitades",
  armarPedido(CARTA, [{ mitadYMitad: { productIdA: "p-muzza", productIdB: "p-muzza" }, cantidad: 1 }])
);
rechaza(
  "una mitad que no existe",
  armarPedido(CARTA, [{ mitadYMitad: { productIdA: "p-muzza", productIdB: "p-fantasma" }, cantidad: 1 }])
);
rechaza(
  "producto y combo en la misma línea",
  armarPedido(CARTA, [
    { productId: "p-empanada", mitadYMitad: { productIdA: "p-muzza", productIdB: "p-especial" }, cantidad: 1 },
  ])
);

// Los agregados del combo: la pantalla arma la lista con los de la primera
// mitad y después los de la segunda, salteando los repetidos por nombre. El
// servidor tiene que aceptar exactamente esa lista y no una más grande.
igual(
  "el combo ofrece los agregados de las dos mitades sin repetir por nombre",
  agregadosDeCombo(pizzaMuzza, pizzaEspecial).map((o) => o.id),
  ["o-borde-muzza", "o-anchoas"]
);
const bordeCaro = armarPedido(CARTA, [
  { mitadYMitad: { productIdA: "p-muzza", productIdB: "p-especial" }, opcionIds: ["o-borde-muzza"], cantidad: 1 },
]);
acepta("el borde de la primera mitad entra", bordeCaro);
igual("y suma su precio", bordeCaro.lineas[0].precioUnitario, 90000 + 12000);
rechaza(
  "el borde barato de la otra mitad, que la pantalla no ofrece, no entra",
  armarPedido(CARTA, [
    { mitadYMitad: { productIdA: "p-muzza", productIdB: "p-especial" }, opcionIds: ["o-borde-especial"], cantidad: 1 },
  ])
);
rechaza(
  "un agregado de un producto ajeno al combo",
  armarPedido(CARTA, [
    { mitadYMitad: { productIdA: "p-muzza", productIdB: "p-especial" }, opcionIds: ["o-cheddar"], cantidad: 1 },
  ])
);
rechaza(
  "una mitad agotada",
  armarPedido(
    CARTA.map((p) => (p.id === "p-especial" ? { ...p, disponible: false } : p)),
    [{ mitadYMitad: { productIdA: "p-muzza", productIdB: "p-especial" }, cantidad: 1 }]
  )
);

// ================================================= montos como los da Prisma
// Prisma no devuelve los Decimal como número: devuelve un objeto. Si este
// módulo hiciera cuentas sin convertir, el subtotal saldría "80008000".
const decimal = (n) => ({ toString: () => String(n) });
const cartaDecimal = [
  { ...empanada, precio: decimal(8000) },
  { ...hamburguesa, precio: decimal(35000), opciones: hamburguesa.opciones.map((o) => ({ ...o, precioExtra: decimal(o.precioExtra) })) },
];
const conDecimal = armarPedido(cartaDecimal, [
  { productId: "p-empanada", cantidad: 2 },
  { productId: "p-hamburguesa", opcionIds: ["o-doble"], cantidad: 1 },
]);
acepta("montos que llegan como Decimal de Prisma", conDecimal);
igual("las cuentas dan igual con Decimal", conDecimal.subtotal, 8000 * 2 + 35000 + 15000);

// ================================================= el total que vio el cliente
igual("un total idéntico no es un cambio", totalSinCambios(120000, 120000), true);
igual("medio guaraní de diferencia se tolera", totalSinCambios(120000.5, 120000), true);
igual("mil guaraníes de diferencia no", totalSinCambios(121000, 120000), false);
igual("un total más barato tampoco pasa", totalSinCambios(120000, 119000), false);
igual("si no mandó total, no se puede comparar", totalSinCambios(120000, undefined), false);
igual("un total que no es número no vale", totalSinCambios(120000, "120000"), false);

console.log(`\n  TOTAL: ${bien} bien, ${mal} mal`);
if (mal > 0) {
  console.log("\n  Fallaron:");
  for (const f of fallos) console.log("     " + f);
  process.exit(1);
}
