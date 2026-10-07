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
  // (El menú digital ya no crea pedidos: arma el mensaje de WhatsApp en el navegador del cliente y la caja carga el pedido a mano
  // en el panel, con permiso. Por eso no hay acciones públicas de pedidos.)
  "src/app/[slug]/reservas/actions.ts": {
    crearReserva: "el cliente no inicia sesión",
  },
  "src/app/[slug]/reserva/[id]/actions.ts": {
    marcarReservaEnviada: "solo marca una reserva que ya existe, filtrando por id + local",
  },
  // La reserva pública de turnos: el cliente no tiene cuenta. El local sale de la
  // dirección de la página (nunca del navegador), la página tiene que estar
  // habilitada y todo lo que llega se vuelve a verificar contra la base.
  "src/app/turnos/[slug]/actions.ts": {
    proximaDisponibilidad: "solo lee: horas libres de los profesionales de ESE local",
    horasDisponibles: "solo lee: horas libres de un profesional de ESE local",
    crearCitaPublica:
      "el cliente no tiene cuenta; crea la cita en el local de la dirección, " +
      "revisando de nuevo servicios, profesional, hora libre y datos",
    marcarCitaEnviada:
      "solo muestra una cita web ya creada, filtrando por id + local; el id no se puede adivinar",
  },
  // El celular fijo del Registro de asistencia (/asistencia/<llave>): el personal no tiene cuenta del panel. El local sale
  // de la llave de la dirección (larga y al azar, regenerable) y a la persona la identifica su PIN, con freno a la
  // adivinanza (se bloquea el celular tras varios PIN malos). Cada acción vuelve a resolver el local y busca a la persona
  // SOLO dentro de él; lo único que escriben es una marcación propia, con su foto.
  "src/app/asistencia/[token]/actions.ts": {
    identificarPin: "solo lee: dice a quién corresponde un PIN del local de la llave y qué marcación le toca",
    registrarMarcacion:
      "el personal no tiene cuenta: la llave lleva al local, el PIN a la persona, y lo único que crea es su propia marcación",
  },
  // El enlace público del personal de una agenda (/personal/<id>): sin usuario ni contraseña. El id de la persona hace de
  // llave: cada acción confirma que sea de alguien ACTIVO y todo queda atado al local de esa persona.
  "src/app/personal/[id]/actions.ts": {
    buscarClientePorTelefono: "solo lee, del MISMO local de esa persona, sin datos sensibles (ni correo ni RUC)",
    subirFotoClienteDesdeEnlace:
      "sube la foto de un cliente del MISMO local de esa persona; valida tipo y tamaño de la imagen",
  },
  // El enlace público del mozo (/mozo/<llave>): el mozo no tiene cuenta del panel. El local sale SIEMPRE de la llave de la
  // dirección y el mozo de una cookie firmada que se obtiene con su PIN (con freno a la adivinanza); cada acción vuelve a
  // comprobar las dos cosas antes de tocar la base, y el precio lo recalcula el servidor.
  "src/app/mozo/[token]/actions.ts": {
    entrarConPin: "es el ingreso del mozo: todavía no hay sesión; comprueba la llave del local, el PIN y el bloqueo",
    salirDelSalon: "salir nunca puede requerir permiso: solo borra la cookie del mozo",
    estadoDelSalon: "solo lee las mesas abiertas del local de la llave; exige la sesión firmada del mozo",
    detalleDeCuenta: "solo lee una cuenta abierta del local de la llave; exige la sesión firmada del mozo",
    imprimirCuentaDelMozo:
      "imprime la cuenta de una mesa del local de la llave solo si el dueño activó la regla; exige la sesión firmada del " +
      "mozo, respeta la regla de ver solo sus cuentas y una sola vez por cuenta",
    enviarPedido:
      "carga un pedido en una mesa del local de la llave; exige la sesión firmada del mozo, recalcula el precio en el " +
      "servidor y no duplica un envío repetido",
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
