// Pruebas de mover categorías y productos de lugar.
// Se corre contra el archivo compilado: node pruebas/ordenar.mjs

import { moverEnLista, cambiosDeOrden } from "./compilado/ordenar.mjs";

let ok = 0;
const fallas = [];
function igual(nombre, a, b) {
  if (JSON.stringify(a) === JSON.stringify(b)) ok++;
  else fallas.push(`${nombre}\n     esperaba: ${JSON.stringify(b)}\n     obtuve:   ${JSON.stringify(a)}`);
}

const L = ["a", "b", "c", "d"];

console.log("\n— moverEnLista —");
igual("subir el del medio", moverEnLista(L, 2, "arriba"), ["a", "c", "b", "d"]);
igual("bajar el del medio", moverEnLista(L, 1, "abajo"), ["a", "c", "b", "d"]);
igual("subir el segundo", moverEnLista(L, 1, "arriba"), ["b", "a", "c", "d"]);
igual("bajar el anteúltimo", moverEnLista(L, 2, "abajo"), ["a", "b", "d", "c"]);

// Los bordes: acá es donde un botón mal hecho borra o duplica un elemento.
igual("subir el PRIMERO no hace nada", moverEnLista(L, 0, "arriba"), L);
igual("bajar el ÚLTIMO no hace nada", moverEnLista(L, 3, "abajo"), L);
igual("bajar el primero sí funciona", moverEnLista(L, 0, "abajo"), ["b", "a", "c", "d"]);
igual("subir el último sí funciona", moverEnLista(L, 3, "arriba"), ["a", "b", "d", "c"]);

// Listas raras que existen de verdad: local recién dado de alta.
igual("lista de uno: subir", moverEnLista(["a"], 0, "arriba"), ["a"]);
igual("lista de uno: bajar", moverEnLista(["a"], 0, "abajo"), ["a"]);
igual("lista vacía", moverEnLista([], 0, "arriba"), []);
igual("lista de dos: subir el segundo", moverEnLista(["a", "b"], 1, "arriba"), ["b", "a"]);

// Índice inválido: nunca debería llegar, pero si llega no puede romper nada.
igual("índice negativo", moverEnLista(L, -1, "abajo"), L);
igual("índice fuera de rango", moverEnLista(L, 99, "arriba"), L);

// Nunca se pierde ni se duplica un elemento.
for (let i = 0; i < L.length; i++) {
  for (const d of ["arriba", "abajo"]) {
    const r = moverEnLista(L, i, d);
    igual(`mover(${i},${d}) conserva los 4 elementos`, [...r].sort(), [...L].sort());
    igual(`mover(${i},${d}) no duplica`, new Set(r).size, 4);
  }
}

console.log("— cambiosDeOrden —");
// El caso real más importante: todos los productos vienen con orden = 0.
igual("todos en 0: renumera todo",
  cambiosDeOrden(["a", "b", "c"], new Map([["a", 0], ["b", 0], ["c", 0]])),
  [{ id: "a", orden: 1 }, { id: "b", orden: 2 }, { id: "c", orden: 3 }]);

// Ya numerado y sin cambios: no escribe nada.
igual("sin cambios: no toca la base",
  cambiosDeOrden(["a", "b", "c"], new Map([["a", 1], ["b", 2], ["c", 3]])), []);

// Un intercambio simple toca solo dos filas.
igual("intercambio: solo 2 filas",
  cambiosDeOrden(["b", "a", "c"], new Map([["a", 1], ["b", 2], ["c", 3]])),
  [{ id: "b", orden: 1 }, { id: "a", orden: 2 }]);

// Huecos de un borrado anterior (1, 5, 9) quedan compactados.
igual("compacta los huecos",
  cambiosDeOrden(["a", "b", "c"], new Map([["a", 1], ["b", 5], ["c", 9]])),
  [{ id: "b", orden: 2 }, { id: "c", orden: 3 }]);

igual("lista vacía no genera cambios", cambiosDeOrden([], new Map()), []);

console.log(`\n${fallas.length === 0 ? "✓" : "✗"} ${ok} pruebas pasaron, ${fallas.length} fallaron`);
for (const f of fallas) console.log("   ✗ " + f);
process.exit(fallas.length === 0 ? 0 : 1);
