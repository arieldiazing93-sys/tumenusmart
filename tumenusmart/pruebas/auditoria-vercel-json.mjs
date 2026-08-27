// ===========================================================================
//  ¿vercel.json va a pasar la validación de Vercel?
// ===========================================================================
//  Vercel valida este archivo contra un esquema estricto y RECHAZA cualquier
//  clave que no conozca. El build ni siquiera arranca: falla antes de compilar.
//
//  Pasó de verdad: puse una clave "//" para dejar un comentario explicando por
//  qué elegimos la región. Ese truco funciona en package.json, pero acá tiró
//  «should NOT have additional property `//`» y tumbó el deploy. JSON no tiene
//  comentarios, y este archivo en particular no perdona.
//
//  La lista sale de la documentación de Vercel
//  (https://vercel.com/docs/project-configuration/vercel-json).
//  Si algún día agregan una clave nueva y la usamos, hay que sumarla acá.
//
//    node pruebas/auditoria-vercel-json.mjs
// ===========================================================================
import { readFileSync, existsSync } from "node:fs";

const CLAVES_VALIDAS = new Set([
  "$schema", "alias", "buildCommand", "builds", "bulkRedirectsPath", "bunVersion",
  "cleanUrls", "crons", "devCommand", "env", "fluid", "framework",
  "functionFailoverRegions", "functions", "headers", "ignoreCommand", "images",
  "installCommand", "name", "outputDirectory", "proxy", "public", "redirects",
  "regions", "rewrites", "routes", "scope", "trailingSlash", "version",
]);

// Región de las funciones ↔ región de la base. Si dejan de coincidir, cada
// consulta vuelve a cruzar el continente.
const REGION_DE_LA_BASE = "gru1"; // sa-east-1, São Paulo — igual que Supabase

const fallas = [];

if (!existsSync("vercel.json")) {
  console.log("  ✗ no existe vercel.json");
  process.exit(1);
}

let config;
try {
  config = JSON.parse(readFileSync("vercel.json", "utf8"));
} catch (e) {
  console.log(`  ✗ vercel.json no es JSON válido: ${e.message}`);
  process.exit(1);
}

const claves = Object.keys(config);
const desconocidas = claves.filter((k) => !CLAVES_VALIDAS.has(k));
if (desconocidas.length) {
  fallas.push(
    `claves que Vercel va a rechazar: ${desconocidas.map((k) => `"${k}"`).join(", ")}` +
      "\n       (JSON no admite comentarios — la explicación va en NOTAS-INFRA.md)"
  );
}

if (!Array.isArray(config.regions) || config.regions[0] !== REGION_DE_LA_BASE) {
  fallas.push(
    `las funciones deberían correr en "${REGION_DE_LA_BASE}" (donde está la base), ` +
      `y dice ${JSON.stringify(config.regions)}`
  );
}

// Los cron de Vercel son de 5 campos y en UTC.
for (const c of config.crons ?? []) {
  if (!/^(\S+\s+){4}\S+$/.test(c.schedule)) {
    fallas.push(`el cron de ${c.path} no tiene 5 campos: "${c.schedule}"`);
  }
  if (!c.path?.startsWith("/")) fallas.push(`ruta de cron inválida: "${c.path}"`);
}

console.log(`  claves: ${claves.join(", ")}`);
console.log(`  región: ${config.regions?.join(", ")} · crons: ${(config.crons ?? []).length}`);
if (fallas.length) {
  console.log(`\n  ✗ ${fallas.length} problema(s):`);
  for (const f of fallas) console.log("     " + f);
  process.exit(1);
}
console.log("  ✓ vercel.json va a pasar la validación");
