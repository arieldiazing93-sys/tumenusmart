// ¿Por qué la ventana de "Compartir mi carta" aparece abajo de todo?
//
// Sospecha: el <main> del panel lleva `animate-panel`, que termina en
// `animation-fill-mode: both`. Ese modo DEJA PEGADO el transform final
// (translateY(0)) para siempre. Y un ancestro con transform distinto de none
// se convierte en el bloque contenedor de sus hijos `position: fixed` — que
// entonces dejan de medirse contra la pantalla y pasan a medirse contra el
// <main>, que es tan alto como toda la lista de pedidos.
//
// Se mide con tres variantes para no quedarnos con la primera explicación
// que suene bien.
import pkg from "/home/claude/.npm-global/lib/node_modules/playwright/index.js";
const { chromium } = pkg;

const pagina = (animacion) => `
<style>
  body { margin:0; font:14px sans-serif }
  @keyframes conTransform { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }
  @keyframes soloOpacidad { from{opacity:0} to{opacity:1} }
  main { ${animacion} }
  .fila { height:60px; border-bottom:1px solid #ddd; padding:8px }
  .modal { position:fixed; inset:0; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,.5) }
  .caja { background:#fff; padding:20px; border-radius:12px }
</style>
<main>
  ${Array.from({length: 40}, (_, i) => `<div class="fila">Pedido #${i+1}</div>`).join("")}
  <div class="modal" id="m"><div class="caja">Compartir mi carta</div></div>
</main>`;

const variantes = [
  // La primera es el bug, y se deja a propósito: una prueba que solo verifica
  // el caso sano no avisa si alguien vuelve a poner el transform.
  ["con transform + fill both (el bug)", "animation: conTransform 0.18s ease-out both;"],
  ["con transform, SIN fill mode",       "animation: conTransform 0.18s ease-out;"],
  ["solo opacidad + fill both (lo que usa el panel)", "animation: soloOpacidad 0.18s ease-out both;"],
];

const navegador = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
let ok = 0; const fallas = [];

for (const [nombre, animacion] of variantes) {
  const pag = await navegador.newPage({ viewport: { width: 900, height: 600 } });
  await pag.setContent(pagina(animacion));
  await pag.waitForTimeout(400);   // que la animación termine

  const r = await pag.evaluate(() => {
    const m = document.getElementById("m").getBoundingClientRect();
    const main = getComputedStyle(document.querySelector("main")).transform;
    return { alto: Math.round(m.height), arriba: Math.round(m.top), transform: main };
  });

  // Si el modal se mide contra la pantalla, su alto es el de la ventana (600).
  const correcto = r.alto === 600 && r.arriba === 0;
  console.log(`  ${nombre.padEnd(42)} alto=${String(r.alto).padStart(4)}  top=${String(r.arriba).padStart(4)}  transform del ancestro: ${r.transform}`);
  if (nombre.includes("el bug")) {
    correcto ? fallas.push("la variante con transform ya NO reproduce el problema — revisar la prueba") : ok++;
  } else {
    correcto ? ok++ : fallas.push(`${nombre}: sigue roto`);
  }
  await pag.close();
}
await navegador.close();
console.log(`\n  ${fallas.length ? "✗" : "✓"} ${ok}/3 — (la primera DEBE estar rota; las otras dos, sanas)`);
for (const f of fallas) console.log("     ✗ " + f);
process.exit(fallas.length ? 1 : 0);
