// Pruebas del formato de guaraníes.
//
// Nació de un error real: el símbolo lo ponía el navegador y en los celulares
// salía "PYG 60.000" en vez de "Gs. 60.000". El cliente veía una moneda que no
// existe justo antes de confirmar cuánto paga.
//
//   node pruebas/format.mjs

import { formatearGuarani, formatearNumero } from "./compilado/format.mjs";

let ok = 0;
const fallas = [];
const igual = (t, a, b) => (a === b ? ok++
  : fallas.push(`${t}\n     esperaba ${JSON.stringify(b)}\n     obtuve   ${JSON.stringify(a)}`));
const cierto = (t, c) => (c ? ok++ : fallas.push(t));

console.log("\n— siempre dice Gs., en cualquier dispositivo —");
igual("sesenta mil", formatearGuarani(60000), "Gs. 60.000");
igual("un millón", formatearGuarani(1000000), "Gs. 1.000.000");
igual("tres cifras", formatearGuarani(850), "Gs. 850");
igual("cero", formatearGuarani(0), "Gs. 0");

// EL caso del error: ningún monto puede contener el código internacional.
for (const v of [0, 1, 999, 1000, 85000, 3064000, 999999999]) {
  cierto(`${v} no dice PYG`, !formatearGuarani(v).includes("PYG"));
  cierto(`${v} empieza con "Gs. "`, formatearGuarani(v).startsWith("Gs. "));
}

console.log("— el separador de miles es el punto, como en Paraguay —");
cierto("mil lleva punto", formatearGuarani(1000) === "Gs. 1.000");
cierto("no usa coma de miles", !formatearGuarani(1000000).includes(","));

console.log("— entradas raras que llegan de la base —");
// Prisma devuelve los Decimal como texto.
igual("texto", formatearGuarani("85000"), "Gs. 85.000");
igual("texto con decimales", formatearGuarani("85000.00"), "Gs. 85.000");
igual("decimales se redondean", formatearGuarani(1500.6), "Gs. 1.501");
igual("negativo", formatearGuarani(-500), "Gs. -500");
// Nunca puede escupir "NaN" en la pantalla del cliente.
igual("texto no numérico", formatearGuarani("hola"), "Gs. 0");
igual("vacío", formatearGuarani(""), "Gs. 0");
cierto("infinito tampoco rompe", formatearGuarani(Infinity) === "Gs. 0");

console.log("— número de pedido —");
igual("rellena a cuatro", formatearNumero(42), "#0042");
igual("uno", formatearNumero(1), "#0001");
igual("no recorta los grandes", formatearNumero(12345), "#12345");

console.log(`\n${fallas.length === 0 ? "✓" : "✗"} ${ok} comprobaciones, ${fallas.length} fallaron`);
for (const f of fallas) console.log("   ✗ " + f);
process.exit(fallas.length === 0 ? 0 : 1);
