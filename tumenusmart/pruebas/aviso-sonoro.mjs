// ¿Suena el aviso cuando entra un pedido?
//
// El reporte fue: "sale la notificación pero no suena". El botón se veía
// verde, así que parecía activado. No lo estaba: los navegadores no dejan
// sonar hasta que la persona toca algo de la página, y ese permiso NO se
// hereda de la visita anterior. La preferencia guardada decía "sí quiero",
// el código lo tomó como "sí puedo", y el botón mintió.
//
// Se prueban tres cosas en Chromium con la política real de autoplay:
//
//   1. Al abrir la pantalla el audio arranca bloqueado (si esto no pasa, el
//      resto de la prueba no está probando nada).
//   2. resume() llamado ANTES de tocar nada deja una promesa colgada PARA
//      SIEMPRE — el motivo del corte por tiempo en `asegurarAudio`.
//   3. Tocar cualquier parte de la pantalla lo destraba.
import pkg from "/home/claude/.npm-global/lib/node_modules/playwright/index.js";
import { writeFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
const { chromium } = pkg;

// Réplica de la lógica del componente, sin React.
const PAGINA = `
<button id="cualquiera">Un pedido cualquiera</button>
<script>
  let ctx = null;
  window.__resumeResolvio = false;
  async function asegurar() {
    try {
      if (!ctx) ctx = new AudioContext();
      if (ctx.state === "suspended") {
        await Promise.race([
          ctx.resume().then(() => { window.__resumeResolvio = true; }),
          new Promise(r => setTimeout(r, 400)),
        ]);
      }
      return ctx.state === "running";
    } catch { return false; }
  }
  window.__estado = () => ctx ? ctx.state : "sin contexto";
  window.__listo = false;
  // Igual que el componente: se intenta al cargar, y el enganche al primer
  // toque se registra SIEMPRE — no después de esperar el intento, que es
  // justo donde se colgaba.
  const alTocar = async () => { window.__listo = await asegurar(); };
  document.addEventListener("pointerdown", alTocar);
  document.addEventListener("keydown", alTocar);
  asegurar().then(v => { window.__alCargar = v; });
</script>`;

const navegador = await chromium.launch({
  args: ["--autoplay-policy=document-user-activation-required"],
});
const pagina = await navegador.newPage();
// Se sirve desde un archivo y no con setContent: en la página en blanco que
// usa setContent, Chromium aplica otra política de audio y arranca sonando —
// con lo cual la prueba pasaría sin haber probado el caso que importa.
const carpeta = mkdtempSync(join(tmpdir(), "aviso-"));
const archivo = join(carpeta, "p.html");
writeFileSync(archivo, PAGINA);
await pagina.goto("file://" + archivo);
await pagina.waitForTimeout(900);

let fallos = 0;
const decir = (ok, texto) => {
  if (!ok) fallos++;
  console.log(`  ${ok ? "✓" : "✗"} ${texto}`);
};

const alCargar = await pagina.evaluate(() => window.__alCargar);
const estado0 = await pagina.evaluate(() => window.__estado());
decir(alCargar === false && estado0 === "suspended",
  `al abrir, el audio arranca bloqueado (estado: ${estado0})`);

decir((await pagina.evaluate(() => window.__resumeResolvio)) === false,
  "resume() antes del toque queda colgado — por eso el corte por tiempo");

decir((await pagina.evaluate(() => window.__alCargar)) !== undefined,
  "aun así `asegurarAudio` devuelve y no se cuelga");

// El encargado toca un botón cualquiera, no uno especial.
await pagina.click("#cualquiera");
await pagina.waitForTimeout(400);
const listo = await pagina.evaluate(() => window.__listo);
const estado1 = await pagina.evaluate(() => window.__estado());
decir(listo === true && estado1 === "running",
  `tocar cualquier parte lo destraba (estado: ${estado1})`);

await navegador.close();
console.log(fallos === 0 ? "\n  ✓ el aviso sonoro se destraba bien" : `\n  ✗ ${fallos} fallo(s)`);
process.exit(fallos === 0 ? 0 : 1);
