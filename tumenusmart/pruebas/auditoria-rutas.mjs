// ===========================================================================
//  ¿Alguna ruta de API o descarga quedó abierta?
// ===========================================================================
//  Las acciones del servidor ya las vigila `auditoria-permisos.mjs`. Esta hace lo mismo con las RUTAS (los archivos
//  `route.ts`: descargas de Excel, consultas del panel, tareas programadas…), que se pueden pedir desde afuera con solo
//  saber la dirección y NO pasan por el layout del panel: el middleware solo mira que exista la cookie, no quién es ni
//  qué puede ver.
//
//  Reglas:
//   - Toda ruta bajo el panel (src/app/admin) tiene que exigir un permiso (negarSiNoPuede, exigirPermiso,
//     pantallaConPermiso, exigirSuperadmin, esSuperadmin o puede(...)): estar logueado no alcanza, un empleado de caja no
//     tiene por qué bajar el reporte de ventas.
//   - Toda ruta de tarea programada (src/app/api/cron) tiene que revisar CRON_SECRET.
//   - Toda otra ruta de src/app/api tiene que exigir sesión, salvo las que figuran abajo como públicas a propósito.
//
//  Si agregás una ruta y esto falla, no es un error de la prueba: falta el control de acceso en la ruta.
//
//    node pruebas/auditoria-rutas.mjs
// ===========================================================================
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// Rutas públicas A PROPÓSITO, cada una con su motivo. Tiene que ser una lista corta: cada línea se justifica.
const PUBLICAS = {
  "src/app/api/reservas/disponibilidad/route.ts":
    "es la información que muestra cualquier pantalla de reservas (lugares libres por horario); no devuelve datos de clientes",
};

const GUARDIAS_DE_PERMISO = [
  "negarSiNoPuede(",
  "exigirPermiso(",
  "pantallaConPermiso(",
  "exigirSuperadmin(",
  "esSuperadmin(",
  "puede(",
];
const GUARDIAS_DE_SESION = ["sesionActual(", "sesionObligatoria(", "haySesionAdminValida(", ...GUARDIAS_DE_PERMISO];

function archivosDeRuta(carpeta) {
  const salida = [];
  for (const nombre of readdirSync(carpeta)) {
    const ruta = join(carpeta, nombre);
    if (statSync(ruta).isDirectory()) salida.push(...archivosDeRuta(ruta));
    else if (/^route\.(ts|tsx)$/.test(nombre)) salida.push(ruta);
  }
  return salida;
}

const raiz = process.cwd();
const rutas = archivosDeRuta(join(raiz, "src", "app")).map((r) => relative(raiz, r).replaceAll("\\", "/"));

const fallas = [];
let revisadas = 0;

for (const ruta of rutas.sort()) {
  const texto = readFileSync(join(raiz, ruta), "utf8");
  revisadas++;

  if (PUBLICAS[ruta]) continue;

  if (ruta.startsWith("src/app/admin/")) {
    if (!GUARDIAS_DE_PERMISO.some((g) => texto.includes(g))) {
      fallas.push(`${ruta}: ruta del panel sin control de PERMISO (negarSiNoPuede / exigirPermiso / pantallaConPermiso / esSuperadmin)`);
    }
  } else if (ruta.startsWith("src/app/api/cron/")) {
    if (!texto.includes("CRON_SECRET")) {
      fallas.push(`${ruta}: tarea programada que no revisa CRON_SECRET`);
    }
  } else if (ruta.startsWith("src/app/api/")) {
    if (!GUARDIAS_DE_SESION.some((g) => texto.includes(g))) {
      fallas.push(`${ruta}: ruta de API sin control de sesión (y no está en la lista de públicas con motivo)`);
    }
  } else {
    fallas.push(`${ruta}: ruta fuera de src/app/admin y src/app/api: decidí cómo se protege y sumala a esta prueba`);
  }
}

console.log(`rutas revisadas: ${revisadas}`);
console.log(`públicas a propósito: ${Object.keys(PUBLICAS).length}`);

if (fallas.length > 0) {
  console.error("\n✗ Hay rutas sin guardia:\n");
  for (const f of fallas) console.error("  - " + f);
  console.error("");
  process.exit(1);
}
console.log("  ✓ todas las rutas tienen su control de acceso");
