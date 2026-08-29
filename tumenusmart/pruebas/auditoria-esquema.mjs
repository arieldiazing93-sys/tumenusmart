// ===========================================================================
//  Auditoría del esquema de Prisma
// ===========================================================================
//  Nació de un build roto en Vercel. Escribí un comentario así:
//
//      /**
//       * Las direcciones que este local tuvo antes.
//       */
//
//  ...que es lo normal en TypeScript y NO EXISTE en Prisma. Prisma solo acepta
//  `//` y `///`. El archivo se veía perfecto, el push salió, y el deploy murió
//  con nueve errores de validación — uno por cada línea del comentario.
//
//  Ninguna de las auditorías que ya había lo agarraba: todas miran archivos
//  .ts/.tsx. El esquema no lo revisaba nadie.
//
//    node pruebas/auditoria-esquema.mjs
// ===========================================================================
import { readFileSync } from "node:fs";

const RUTA = "prisma/schema.prisma";

export function revisarEsquema(texto) {
  const problemas = [];
  const lineas = texto.split("\n");

  // 1) Comentarios de bloque: no existen en Prisma.
  lineas.forEach((l, i) => {
    if (l.includes("/*") || l.includes("*/")) {
      problemas.push(
        `línea ${i + 1}: comentario de bloque /* */ — Prisma solo entiende // y ///`
      );
    }
  });

  // 2) Llaves parejas. Un modelo sin cerrar se traga todo lo que sigue y el
  //    error que reporta Prisma apunta a cualquier lado menos al problema.
  const abren = (texto.match(/\{/g) ?? []).length;
  const cierran = (texto.match(/\}/g) ?? []).length;
  if (abren !== cierran) {
    problemas.push(`llaves desparejas: ${abren} abren y ${cierran} cierran`);
  }

  // 3) Toda relación tiene que apuntar a un modelo o enum que exista.
  const modelos = new Set(
    [...texto.matchAll(/^(?:model|enum)\s+(\w+)\s*\{/gm)].map((m) => m[1])
  );
  const basicos = new Set([
    "String", "Int", "BigInt", "Float", "Decimal", "Boolean",
    "DateTime", "Json", "Bytes", "Unsupported",
  ]);

  let modeloActual = null;
  lineas.forEach((linea, i) => {
    const abre = linea.match(/^model\s+(\w+)\s*\{/);
    if (abre) { modeloActual = abre[1]; return; }
    if (/^\}/.test(linea)) { modeloActual = null; return; }
    if (!modeloActual) return;

    const campo = linea.match(/^\s{2,}(\w+)\s+(\w+)(\[\])?\??/);
    if (!campo) return;
    const tipo = campo[2];
    if (basicos.has(tipo) || modelos.has(tipo)) return;
    // @@index, @@unique y demás no son campos.
    if (campo[1].startsWith("@")) return;
    problemas.push(
      `línea ${i + 1}: el modelo ${modeloActual} usa el tipo "${tipo}", que no existe`
    );
  });

  return problemas;
}

// ---------------------------------------------------------------- autoprueba
// Un auditor equivocado es peor que no tener auditor. Antes de revisar el
// archivo de verdad, se comprueba que sepa encontrar el error que le dio
// origen — si esto no falla, la auditoría no sirve para nada.
const ROTO = `
model Store {
  id String @id
}

/**
 * comentario al estilo TypeScript
 */
model SlugAnterior {
  id String @id
}
`;
const detectados = revisarEsquema(ROTO);
if (!detectados.some((p) => p.includes("bloque"))) {
  console.log("  ✗ la autoprueba falló: la auditoría NO detecta el error que la originó");
  process.exit(1);
}
const sano = revisarEsquema(`model Store {\n  id String @id\n}\n`);
if (sano.length !== 0) {
  console.log(`  ✗ la autoprueba falló: inventa errores en un esquema sano — ${sano}`);
  process.exit(1);
}

// ------------------------------------------------------------------ revisión
const problemas = revisarEsquema(readFileSync(RUTA, "utf8"));
if (problemas.length === 0) {
  console.log("  ✓ esquema de Prisma limpio");
  process.exit(0);
}
console.log(`  ✗ ${problemas.length} problema(s) en ${RUTA}:`);
for (const p of problemas) console.log(`      ${p}`);
process.exit(1);
