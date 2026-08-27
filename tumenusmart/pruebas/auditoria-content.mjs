// ===========================================================================
//  ¿Tailwind está mirando todos los archivos que tienen clases?
// ===========================================================================
//  Tailwind SOLO genera las clases que encuentra en los archivos listados en
//  `content`. Una clase escrita en un archivo fuera de esa lista no da error,
//  no rompe el build, y en pantalla simplemente no pinta.
//
//  Pasó de verdad: los colores de estado de pedidos y reservas viven en
//  src/lib, que no estaba en la lista. El encargado veía todos los estados en
//  gris y no había forma de darse cuenta mirando el código.
//
//    node pruebas/auditoria-content.mjs
// ===========================================================================
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const { default: config } = await import("./compilado/tailwind.config.mjs");
const globs = config.content;

/**
 * Convierte un glob de Tailwind en una expresión regular.
 *
 * El orden importa y la primera versión lo tenía mal: escapaba los caracteres
 * especiales ANTES de interpretar las llaves, así que `{ts,tsx}` llegaba como
 * `\{ts,tsx\}` y no lo reconocía nunca. Resultado: decía que los 83 archivos
 * estaban fuera del content, que es obviamente falso. Por eso abajo hay una
 * auto-prueba: un auditor equivocado es peor que no tener auditor.
 */
function aRegex(glob) {
  const limpio = glob.replace(/^\.\//, "");
  let patron = "";
  for (let i = 0; i < limpio.length; i++) {
    const c = limpio[i];
    if (c === "{") {
      const fin = limpio.indexOf("}", i);
      patron += "(" + limpio.slice(i + 1, fin).split(",").join("|") + ")";
      i = fin;
    } else if (c === "*" && limpio[i + 1] === "*" && limpio[i + 2] === "/") {
      patron += "(?:[^/]+/)*";   // cero o más carpetas
      i += 2;
    } else if (c === "*") {
      patron += "[^/]*";          // dentro de un solo nivel
    } else if (".+^$()|[]\\?".includes(c)) {
      patron += "\\" + c;
    } else {
      patron += c;
    }
  }
  return new RegExp(`^${patron}$`);
}

// --- auto-prueba del conversor ---
const CASOS = [
  ["./src/app/**/*.{ts,tsx}", "src/app/page.tsx", true],
  ["./src/app/**/*.{ts,tsx}", "src/app/admin/(protected)/pedidos/page.tsx", true],
  ["./src/app/**/*.{ts,tsx}", "src/app/[slug]/page.tsx", true],
  ["./src/app/**/*.{ts,tsx}", "src/lib/reservas.ts", false],
  ["./src/app/**/*.{ts,tsx}", "src/app/page.css", false],
  ["./src/components/**/*.{ts,tsx}", "src/components/ui.tsx", true],
  ["./src/lib/**/*.{ts,tsx}", "src/lib/estados-pedido.ts", true],
];
const malos = CASOS.filter(([g, ruta, esperado]) => aRegex(g).test(ruta) !== esperado);
if (malos.length) {
  console.log("  ✗ el conversor de globs está roto:");
  for (const [g, ruta, esperado] of malos) {
    console.log(`     ${g}  vs  ${ruta}  → esperaba ${esperado}`);
  }
  process.exit(1);
}

const regexes = globs.map(aRegex);

function archivos(dir) {
  const salida = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) salida.push(...archivos(p));
    else if (/\.tsx?$/.test(n)) salida.push(p);
  }
  return salida;
}

// Clases con pinta de Tailwind: prefijo conocido + guion.
const PATRON_CLASE =
  /\b(bg|text|border|rounded|flex|grid|p[xytblr]?|m[xytblr]?|gap|w|h|min-w|max-w|shadow|ring|hover:|focus:|sm:|md:|lg:|print:)-[a-z0-9[]/;

const problemas = [];
let conClases = 0;

for (const f of archivos("src")) {
  const rel = relative(".", f).replace(/\\/g, "/");
  const txt = readFileSync(f, "utf8");
  // Solo interesan los archivos que REALMENTE escriben clases.
  const tieneClases =
    /className\s*=/.test(txt) ||
    (/"[^"]*\b(bg|text|border)-[a-z]/.test(txt) && PATRON_CLASE.test(txt));
  if (!tieneClases) continue;
  conClases++;
  if (!regexes.some((r) => r.test(rel))) problemas.push(rel);
}

console.log(`  globs en content: ${globs.join(", ")}`);
console.log(`  archivos con clases: ${conClases}`);
if (problemas.length) {
  console.log(`\n  ✗ ${problemas.length} archivo(s) con clases que Tailwind NO mira:`);
  for (const p of problemas) console.log("     " + p);
  console.log("     → esas clases no van a pintar nada. Agregalos a `content`.");
  process.exit(1);
}
console.log("  ✓ todos los archivos con clases están cubiertos");
