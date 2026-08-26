// ===========================================================================
//  Auditoría de clases de color
// ===========================================================================
//  Una clase de Tailwind mal escrita NO da error de compilación: simplemente
//  no genera CSS. `bg-azul-claro` (que no existe) deja el botón transparente y
//  el build pasa en verde. Es el tipo de error que se descubre en producción,
//  mirando la pantalla.
//
//  Esto lee los colores reales de tailwind.config.ts y verifica que cada clase
//  que los usa apunte a un tono que exista.
//
//    node pruebas/auditoria-colores.mjs
// ===========================================================================
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// Se COMPILA tailwind.config.ts y se importa el objeto de verdad. Antes esto
// leía el archivo con expresiones regulares y se equivocaba solo: confundía los
// keyframes con colores e inventaba diez errores que no existían. Si hay que
// adivinar la forma del archivo, la auditoría miente.
const { default: config } = await import("./compilado/tailwind.config.mjs");
const colores = config.theme.extend.colors;

const familias = new Map();
for (const [nombre, valor] of Object.entries(colores)) {
  familias.set(nombre, new Set(typeof valor === "string" ? ["DEFAULT"] : Object.keys(valor)));
}

const prefijos = ["bg", "text", "border", "ring", "fill", "stroke", "from", "to", "via",
                  "divide", "outline", "shadow", "decoration", "accent", "caret", "placeholder"];

function archivos(dir) {
  const salida = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) salida.push(...archivos(p));
    else if (/\.tsx?$/.test(n)) salida.push(p);
  }
  return salida;
}

const problemas = [];
let revisadas = 0;
const nombres = [...familias.keys()].join("|");
const patron = new RegExp(`\\b(${prefijos.join("|")})-(${nombres})(-[a-z]+)?\\b`, "g");

for (const f of archivos("src")) {
  const txt = readFileSync(f, "utf8");
  txt.split("\n").forEach((linea, i) => {
    for (const m of linea.matchAll(patron)) {
      revisadas++;
      const tono = m[3] ? m[3].slice(1) : "DEFAULT";
      if (!familias.get(m[2]).has(tono)) {
        problemas.push(`${f}:${i + 1}  ${m[0]}  →  "${m[2]}" no tiene el tono "${tono}" (tiene: ${[...familias.get(m[2])].join(", ")})`);
      }
    }
  });
}

console.log(`  familias de color: ${[...familias.keys()].join(", ")}`);
console.log(`  clases revisadas: ${revisadas}`);
if (problemas.length) {
  console.log(`\n  ✗ ${problemas.length} clase(s) que NO van a pintar nada:`);
  for (const p of problemas) console.log("     " + p);
  process.exit(1);
}
console.log("  ✓ todas las clases de color existen");
