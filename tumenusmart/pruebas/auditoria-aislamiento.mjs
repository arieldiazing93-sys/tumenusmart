// ===========================================================================
//  Auditoría del aislamiento entre locales
// ===========================================================================
//  El filtro por local (prismaDelLocal) solo actúa sobre las tablas que están
//  anotadas en MODELOS_POR_LOCAL, en src/lib/alcance-local.ts. Si una tabla
//  nueva tiene `storeId` y nadie la anota ahí, NO da ningún error: la consulta
//  sale sin filtro y un local ve los datos de otro. Una fuga silenciosa, que
//  recién se descubre cuando un cliente la ve.
//
//  Esta auditoría compara las dos cosas, solo leyendo texto:
//
//    - toda tabla con `storeId` tiene que estar en MODELOS_POR_LOCAL, o figurar
//      más abajo como EXCEPCION con el motivo escrito;
//    - todo lo que dice MODELOS_POR_LOCAL tiene que existir en el esquema y
//      tener `storeId` (un error de tipeo ahí deja la tabla sin protección);
//    - una excepción no puede estar también en la lista, ni quedar vieja.
//
//    node pruebas/auditoria-aislamiento.mjs
// ===========================================================================
import { readFileSync } from "node:fs";

const RUTA_ESQUEMA = "prisma/schema.prisma";
const RUTA_LISTA = "src/lib/alcance-local.ts";

/**
 * Tablas que tienen `storeId` y a propósito NO se filtran solas. Cada una
 * necesita su motivo: si no se puede explicar, probablemente va en la lista.
 */
export const EXCEPCIONES = new Map([
  [
    "Usuario",
    "el login la lee para averiguar de qué local es la persona; filtrarla por local impediría iniciar sesión",
  ],
  [
    "ErrorReportado",
    "su storeId es opcional: hay errores que ocurren fuera de cualquier local (portada, login, cron) y se revisan todos juntos",
  ],
  [
    "SlugAnterior",
    "se busca por la dirección vieja para redirigir, antes de saber de qué local es",
  ],
]);

/** Qué modelos tiene el esquema y cuáles de ellos tienen un campo storeId. */
export function leerModelos(esquema) {
  const todos = new Set();
  const conStoreId = new Set();
  let actual = null;
  for (const linea of esquema.split(/\r?\n/)) {
    const abre = linea.match(/^model\s+(\w+)\s*\{/);
    if (abre) {
      actual = abre[1];
      todos.add(actual);
      continue;
    }
    if (/^\}/.test(linea)) {
      actual = null;
      continue;
    }
    if (actual && /^\s+storeId\s+String\b/.test(linea)) conStoreId.add(actual);
  }
  return { todos, conStoreId };
}

/** Los nombres que hay dentro de MODELOS_POR_LOCAL, o null si no lo encuentra. */
export function leerLista(codigo) {
  const bloque = codigo.match(/MODELOS_POR_LOCAL\s*=\s*new Set\(\[([\s\S]*?)\]\)/);
  if (!bloque) return null;
  const sinComentarios = bloque[1].replace(/\/\/.*$/gm, "");
  return new Set([...sinComentarios.matchAll(/"(\w+)"/g)].map((m) => m[1]));
}

export function revisarAislamiento(esquema, codigo, excepciones) {
  const { todos, conStoreId } = leerModelos(esquema);
  const lista = leerLista(codigo);

  // Si el formato cambió y no se encuentra nada, mejor fallar que dar un
  // "todo bien" sobre una lista vacía.
  if (!lista || lista.size === 0) {
    return ["no encontré MODELOS_POR_LOCAL en alcance-local.ts: ¿cambió su formato?"];
  }
  if (todos.size === 0) {
    return ["no encontré ningún modelo en schema.prisma"];
  }

  const problemas = [];

  for (const m of [...conStoreId].sort()) {
    if (lista.has(m) || excepciones.has(m)) continue;
    problemas.push(
      `${m} tiene storeId pero NO está en MODELOS_POR_LOCAL: sus consultas no se filtran por local (fuga silenciosa)`
    );
  }

  for (const m of [...lista].sort()) {
    if (!todos.has(m)) {
      problemas.push(`MODELOS_POR_LOCAL nombra "${m}", que no existe en el esquema: ¿error de tipeo?`);
    } else if (!conStoreId.has(m)) {
      problemas.push(`${m} está en MODELOS_POR_LOCAL pero no tiene storeId: toda consulta sobre esa tabla fallaría`);
    }
  }

  for (const m of [...excepciones.keys()].sort()) {
    if (lista.has(m)) {
      problemas.push(`${m} figura como excepción y también está en MODELOS_POR_LOCAL: elegí una sola`);
    } else if (!conStoreId.has(m)) {
      problemas.push(`${m} figura como excepción pero ya no existe o ya no tiene storeId: sacala de EXCEPCIONES`);
    }
  }

  return problemas;
}

// ---------------------------------------------------------------- autoprueba
// Un auditor equivocado es peor que no tener auditor. Antes de revisar los
// archivos de verdad, se comprueba que sepa encontrar cada tipo de error.
const ESQUEMA_PRUEBA = `
model Store {
  id String @id
}

model Pedido {
  id      String @id
  storeId String
}

model Nueva {
  id      String @id
  storeId String
}

model Usuario {
  id      String  @id
  storeId String?
}
`;
const listaDe = (...nombres) =>
  `export const MODELOS_POR_LOCAL = new Set([${nombres.map((n) => `"${n}"`).join(", ")}]);`;
const conUsuario = new Map([["Usuario", "motivo"]]);

function fallarAutoprueba(texto) {
  console.log(`  ✗ la autoprueba falló: ${texto}`);
  process.exit(1);
}

const olvidada = revisarAislamiento(ESQUEMA_PRUEBA, listaDe("Pedido"), conUsuario);
if (!olvidada.some((p) => p.startsWith("Nueva "))) {
  fallarAutoprueba("NO detecta una tabla con storeId que falta en la lista");
}

const tipeo = revisarAislamiento(ESQUEMA_PRUEBA, listaDe("Pedido", "Nueva", "Pedidoo"), conUsuario);
if (!tipeo.some((p) => p.includes("Pedidoo"))) {
  fallarAutoprueba("NO detecta un nombre de la lista que no existe en el esquema");
}

const sinExcepcion = revisarAislamiento(ESQUEMA_PRUEBA, listaDe("Pedido", "Nueva"), new Map());
if (!sinExcepcion.some((p) => p.startsWith("Usuario "))) {
  fallarAutoprueba("NO detecta un storeId opcional sin excepción escrita");
}

const sano = revisarAislamiento(ESQUEMA_PRUEBA, listaDe("Pedido", "Nueva"), conUsuario);
if (sano.length !== 0) {
  fallarAutoprueba(`inventa errores en un caso sano — ${sano.join(" | ")}`);
}

// ------------------------------------------------------------------ revisión
const esquema = readFileSync(RUTA_ESQUEMA, "utf8");
const codigo = readFileSync(RUTA_LISTA, "utf8");
const problemas = revisarAislamiento(esquema, codigo, EXCEPCIONES);

if (problemas.length === 0) {
  const protegidas = leerLista(codigo).size;
  console.log(
    `  ✓ aislamiento entre locales: ${protegidas} tablas protegidas, ${EXCEPCIONES.size} excepciones con motivo`
  );
  process.exit(0);
}
console.log(`  ✗ ${problemas.length} problema(s) de aislamiento entre locales:`);
for (const p of problemas) console.log(`      ${p}`);
console.log("      (si es una tabla nueva: agregala a MODELOS_POR_LOCAL en src/lib/alcance-local.ts)");
process.exit(1);
