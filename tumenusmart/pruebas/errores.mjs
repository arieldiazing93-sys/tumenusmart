// Pruebas de las reglas de aviso de errores.
//
// Lo que se prueba acá decide si el sistema sirve o te llena la casilla:
// si la huella agrupa mal, un solo problema manda cuarenta correos.
//
//   node pruebas/errores.mjs

import {
  huellaDeError, decidirAviso, asuntoDelAviso, recortar,
  HORAS_ENTRE_AVISOS, TOPE_AVISOS_POR_DIA,
} from "./compilado/errores.mjs";

let ok = 0;
const fallas = [];
const igual = (t, a, b) => (JSON.stringify(a) === JSON.stringify(b) ? ok++
  : fallas.push(`${t}\n     esperaba ${JSON.stringify(b)}\n     obtuve   ${JSON.stringify(a)}`));
const cierto = (t, c) => (c ? ok++ : fallas.push(t));

console.log("\n— agrupar el mismo problema —");
// EL caso que importa: el mismo bug con ids distintos tiene que ser UNO.
const a = huellaDeError("No existe el pedido cmtamztxx0005gjx9p1amtw3o", "/admin/pedidos/cmtamztxx0005gjx9p1amtw3o");
const b = huellaDeError("No existe el pedido cmt311j7c0002vabc9defgh", "/admin/pedidos/cmt311j7c0002vabc9defgh");
igual("mismo error con ids distintos = misma huella", a, b);

igual("números distintos = misma huella",
  huellaDeError("Timeout after 5000ms", "/admin/pedidos"),
  huellaDeError("Timeout after 30000ms", "/admin/pedidos"));

igual("valores entrecomillados no separan",
  huellaDeError(`Column "costo" does not exist`, "/admin/productos"),
  huellaDeError(`Column "margen" does not exist`, "/admin/productos"));

igual("mayúsculas no separan",
  huellaDeError("ERROR DE CONEXIÓN", "/admin"),
  huellaDeError("error de conexión", "/admin"));

igual("uuid con guiones también se agrupa",
  huellaDeError("falta 550e8400-e29b-41d4-a716-446655440000", "/x"),
  huellaDeError("falta 6ba7b810-9dad-11d1-80b4-00c04fd430c8", "/x"));

// Y lo contrario: problemas DISTINTOS no se pueden mezclar, o uno tapa al otro.
cierto("errores distintos NO se agrupan",
  huellaDeError("No hay conexión a la base", "/admin/pedidos") !==
  huellaDeError("No existe la columna costo", "/admin/pedidos"));
cierto("el mismo error en pantallas distintas NO se agrupa",
  huellaDeError("Sin permiso", "/admin/pedidos") !==
  huellaDeError("Sin permiso", "/admin/estadisticas"));

cierto("la huella no crece sin límite",
  huellaDeError("x".repeat(5000), "/y".repeat(500)).length <= 300);

console.log("— cuándo avisar —");
const AHORA = new Date("2026-08-27T20:00:00Z");
const haceHoras = (h) => new Date(AHORA.getTime() - h * 3_600_000);

igual("problema nuevo: avisa siempre",
  decidirAviso({ ultimoAvisoEn: null, avisosHoy: 0 }, AHORA), { avisar: true });

igual("ya avisado recién: espera",
  decidirAviso({ ultimoAvisoEn: haceHoras(1), avisosHoy: 3 }, AHORA),
  { avisar: false, motivo: "reciente" });

igual(`justo antes de las ${HORAS_ENTRE_AVISOS}h: espera`,
  decidirAviso({ ultimoAvisoEn: haceHoras(HORAS_ENTRE_AVISOS - 0.1), avisosHoy: 3 }, AHORA),
  { avisar: false, motivo: "reciente" });

igual(`pasadas las ${HORAS_ENTRE_AVISOS}h: vuelve a avisar`,
  decidirAviso({ ultimoAvisoEn: haceHoras(HORAS_ENTRE_AVISOS), avisosHoy: 3 }, AHORA),
  { avisar: true });

console.log("— el tope diario —");
igual("en el tope: corta",
  decidirAviso({ ultimoAvisoEn: null, avisosHoy: TOPE_AVISOS_POR_DIA }, AHORA),
  { avisar: false, motivo: "tope-diario" });
igual("uno antes del tope: pasa",
  decidirAviso({ ultimoAvisoEn: null, avisosHoy: TOPE_AVISOS_POR_DIA - 1 }, AHORA),
  { avisar: true });
// El tope manda sobre todo lo demás: si no, un día malo agota los 100 del plan.
igual("el tope gana aunque el problema sea nuevo",
  decidirAviso({ ultimoAvisoEn: null, avisosHoy: 999 }, AHORA),
  { avisar: false, motivo: "tope-diario" });
cierto("el tope deja margen sobre los 100 del plan gratuito", TOPE_AVISOS_POR_DIA < 100);

console.log("— asunto y recorte —");
igual("asunto con local", asuntoDelAviso("Don Mario", "/admin/pedidos"),
  "Error en Don Mario · /admin/pedidos");
igual("asunto sin local", asuntoDelAviso(null, "/checkout"), "Error · /checkout");
cierto("asunto acotado", asuntoDelAviso("x".repeat(300), "/y".repeat(300)).length <= 120);
igual("texto corto no se toca", recortar("hola", 100), "hola");
cierto("texto largo se recorta y se avisa", recortar("x".repeat(9000)).includes("recortado"));

console.log(`\n${fallas.length === 0 ? "✓" : "✗"} ${ok} comprobaciones, ${fallas.length} fallaron`);
for (const f of fallas) console.log("   ✗ " + f);
process.exit(fallas.length === 0 ? 0 : 1);
