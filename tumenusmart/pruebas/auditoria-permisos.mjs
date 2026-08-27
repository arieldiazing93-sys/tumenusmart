// ===========================================================================
//  ¿Alguna acción del servidor quedó sin guardia?
// ===========================================================================
//  Una acción de Next se puede llamar desde afuera del panel: con el navegador
//  cerrado, sabiendo solo su nombre. Esconder el botón no protege nada.
//
//  Por eso cada acción que escribe en la base tiene que empezar exigiendo un
//  permiso. Esta prueba recorre TODOS los archivos "use server" y falla si
//  encuentra una exportada que no lo haga.
//
//  Que exista esta prueba y no una revisión a ojo importa: el día que alguien
//  agregue una acción nueva y se olvide, esto lo frena antes de publicar.
//
//    node pruebas/auditoria-permisos.mjs
// ===========================================================================
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// Acciones que legítimamente NO exigen permiso, cada una con su motivo.
//
// La lista es corta a propósito y cada línea hay que justificarla: si mañana
// alguien agrega algo acá sin una buena razón, se nota al leerla.
const EXCEPCIONES = {
  // --- el panel, antes de que haya sesión ---
  "src/app/admin/login/actions.ts": {
    iniciarSesion: "es el login: todavía no hay sesión que consultar",
    crearPrimerUsuario: "crea el primer superadmin cuando la base está vacía",
  },
  "src/app/admin/(protected)/logout/actions.ts": {
    cerrarSesion: "salir nunca puede requerir permiso",
  },
  "src/app/admin/(protected)/mi-cuenta/actions.ts": {
    cambiarMiPassword: "cualquiera puede cambiar SU propia contraseña",
  },

  // --- la parte pública: acá no hay usuarios, hay clientes ---
  //
  // Nadie inicia sesión para pedir una pizza. Estas acciones se protegen de
  // otra forma: el id de la URL es un cuid imposible de adivinar, y cada una
  // verifica que lo que va a tocar pertenezca a ese local.
  "src/app/[slug]/checkout/actions.ts": {
    crearPedido: "el cliente no tiene cuenta; el pedido se crea contra el local del slug",
  },
  "src/app/[slug]/reservas/actions.ts": {
    crearReserva: "igual que el pedido: el cliente no inicia sesión",
  },
  "src/app/[slug]/pedido/[id]/actions.ts": {
    marcarEnviadoWhatsapp: "solo marca un pedido que ya existe, filtrando por id + local",
  },
  "src/app/[slug]/reserva/[id]/actions.ts": {
    marcarReservaEnviada: "igual que la anterior",
  },
  "src/app/repartidor/[id]/actions.ts": {
    marcarPedidoEntregado:
      "el repartidor no tiene cuenta; la acción verifica que el pedido esté " +
      "asignado a ESE repartidor y sea de su mismo local",
  },
};

function archivos(dir) {
  const salida = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) salida.push(...archivos(p));
    else if (/\.tsx?$/.test(n)) salida.push(p);
  }
  return salida;
}

const GUARDIAS = /exigirPermiso|exigirSuperadmin|sesionObligatoria|pantallaConPermiso/;

const problemas = [];
let revisadas = 0;

for (const f of archivos("src/app")) {
  const txt = readFileSync(f, "utf8");
  if (!/^\s*["']use server["']/m.test(txt)) continue;
  const rel = relative(".", f).replace(/\\/g, "/");

  for (const m of txt.matchAll(/export async function (\w+)\s*\(/g)) {
    const nombre = m.group ? m.group(1) : m[1];
    revisadas++;
    const motivo = EXCEPCIONES[rel]?.[nombre];
    if (motivo) continue;

    // Se mira el cuerpo: desde el nombre hasta la próxima exportación.
    const desde = m.index;
    const siguiente = txt.indexOf("\nexport ", desde + 1);
    const cuerpo = txt.slice(desde, siguiente === -1 ? txt.length : siguiente);
    if (!GUARDIAS.test(cuerpo)) {
      problemas.push(`${rel}  →  ${nombre}()`);
    }
  }
}

console.log(`  acciones del servidor revisadas: ${revisadas}`);
const cuantasExcepciones = Object.values(EXCEPCIONES).reduce(
  (s, o) => s + Object.keys(o).length, 0);
console.log(`  excepciones declaradas: ${cuantasExcepciones}`);

if (problemas.length) {
  console.log(`\n  ✗ ${problemas.length} acción(es) SIN guardia de permiso:`);
  for (const p of problemas) console.log("     " + p);
  console.log("     → agregá await exigirPermiso(\"...\") al principio,");
  console.log("       o declarala como excepción con su motivo en esta prueba.");
  process.exit(1);
}
console.log("  ✓ todas las acciones exigen un permiso");
