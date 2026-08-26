// Pruebas del buscador y de la ficha de la carta pública.
//
// Se corre contra el archivo COMPILADO (pruebas/compilado/carta.mjs), no
// contra el .ts: así se prueba lo que realmente va a ejecutar el navegador.
//
//   npx tsc src/lib/carta.ts --ignoreConfig --outDir pruebas/compilado \
//       --target es2020 --module esnext --moduleResolution bundler --skipLibCheck
//   mv pruebas/compilado/carta.js pruebas/compilado/carta.mjs
//   node pruebas/carta.mjs

import { necesitaFicha, normalizar, filtrarCarta } from "./compilado/carta.mjs";

let ok = 0;
const fallas = [];
function verificar(nombre, condicion) {
  if (condicion) ok++;
  else fallas.push(nombre);
}
function igual(nombre, a, b) {
  const mismo = JSON.stringify(a) === JSON.stringify(b);
  if (!mismo) fallas.push(`${nombre}\n     esperaba: ${JSON.stringify(b)}\n     obtuve:   ${JSON.stringify(a)}`);
  else ok++;
}

function prod(nombre, extra = {}) {
  return {
    id: nombre.toLowerCase().replace(/\s/g, "-"),
    nombre,
    descripcion: null,
    precio: 30000,
    imagenUrl: null,
    ingredientes: [],
    opciones: [],
    ...extra,
  };
}
function cat(nombre, productos, grupos = []) {
  return { id: `c-${nombre}`, nombre, productos, grupos };
}

// ---------------------------------------------------------------------------
console.log("\n— normalizar —");
igual("saca la tilde", normalizar("Jalapeño"), "jalapeno");
igual("baja a minúsculas", normalizar("MILANESA"), "milanesa");
igual("acentos varios", normalizar("Café Ñandutí Ámbar"), "cafe ñanduti ambar".replace("ñ", "n"));
igual("no toca lo que ya está limpio", normalizar("pizza"), "pizza");
igual("texto vacío", normalizar(""), "");
verificar("la ñ también se normaliza", normalizar("ñ") === "n");

// ---------------------------------------------------------------------------
console.log("— necesitaFicha —");
verificar("sin opciones ni ingredientes: NO abre ficha", necesitaFicha(prod("Coca 500")) === false);
verificar("con una opción: abre ficha", necesitaFicha(prod("Pizza", { opciones: [{ id: "1", nombre: "Grande", tipo: "variante", precioExtra: 0 }] })) === true);
verificar("con ingredientes: abre ficha", necesitaFicha(prod("Hamburguesa", { ingredientes: ["tomate", "lechuga"] })) === true);
verificar("con ambos: abre ficha", necesitaFicha(prod("Lomito", { ingredientes: ["huevo"], opciones: [{ id: "2", nombre: "Extra queso", tipo: "agregado", precioExtra: 5000 }] })) === true);
verificar("ingrediente vacío no cuenta", necesitaFicha(prod("Agua", { ingredientes: [] })) === false);

// ---------------------------------------------------------------------------
console.log("— filtrarCarta —");
const carta = [
  cat("Pizzas", [
    prod("Pizza Napolitana", { descripcion: "Con jamón y morrón" }),
    prod("Pizza Muzzarella"),
  ], [{ clave: "g1", nombreVisible: "Pizza Grande", productos: [] }]),
  cat("Bebidas", [prod("Coca Cola 500"), prod("Agua sin gas")]),
  cat("Postres", [prod("Flan casero", { descripcion: "Con dulce de leche" })]),
];

igual("sin búsqueda devuelve todo igual", filtrarCarta(carta, ""), carta);
igual("solo espacios devuelve todo igual", filtrarCarta(carta, "   "), carta);

const r1 = filtrarCarta(carta, "pizza");
igual("busca 'pizza': queda 1 categoría", r1.length, 1);
igual("busca 'pizza': 2 productos", r1[0].productos.length, 2);
igual("buscando se ocultan los combos", r1[0].grupos, []);

const r2 = filtrarCarta(carta, "PIZZA");
igual("mayúsculas encuentran igual", r2[0].productos.length, 2);

const r3 = filtrarCarta(carta, "jamon");
igual("busca sin tilde en la descripción: 1 categoría", r3.length, 1);
igual("...y 1 solo producto", r3[0].productos[0].nombre, "Pizza Napolitana");

const r4 = filtrarCarta(carta, "jamón");
igual("busca CON tilde y encuentra lo mismo", r4[0].productos[0].nombre, "Pizza Napolitana");

const r5 = filtrarCarta(carta, "coca");
igual("busca en otra categoría", r5[0].nombre, "Bebidas");
igual("las categorías sin resultado desaparecen", r5.length, 1);

igual("algo que no existe: carta vacía", filtrarCarta(carta, "sushi"), []);
igual("búsqueda con espacios alrededor", filtrarCarta(carta, "  coca  ")[0].nombre, "Bebidas");
igual("coincidencia parcial en el medio", filtrarCarta(carta, "zzarel")[0].productos[0].nombre, "Pizza Muzzarella");
igual("busca por la descripción sola", filtrarCarta(carta, "dulce de leche")[0].nombre, "Postres");

// El filtro NO debe modificar la carta original: si lo hiciera, borrar el
// texto del buscador dejaría al cliente sin combos para siempre.
filtrarCarta(carta, "pizza");
igual("no rompe la carta original", carta[0].grupos.length, 1);
igual("no rompe los productos originales", carta[0].productos.length, 2);

// Un producto que solo coincide en la categoría no debería aparecer: el
// cliente busca productos, no rubros.
igual("el nombre de la categoría no cuenta como coincidencia", filtrarCarta(carta, "bebidas"), []);

// ---------------------------------------------------------------------------
console.log(`\n${fallas.length === 0 ? "✓" : "✗"} ${ok} pruebas pasaron, ${fallas.length} fallaron`);
for (const f of fallas) console.log("   ✗ " + f);
process.exit(fallas.length === 0 ? 0 : 1);
