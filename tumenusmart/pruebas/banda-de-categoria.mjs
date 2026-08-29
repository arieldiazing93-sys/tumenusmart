// ¿La banda de categoría de la carta se pega donde tiene que pegarse?
//
// La banda lleva `position: sticky` con el `top` calculado a mano: sale de
// MEDIR la barra de chips, porque esa barra cambia de alto (hay buscador o no,
// hay chips o no, se está buscando o no). Un número escrito a mano se
// desincroniza en cuanto pasa cualquiera de esas tres cosas.
//
// Dos cosas pueden salir mal y ninguna da error de compilación:
//
//   1. Que quede un hueco entre la barra y la banda, o que la banda se meta
//      abajo de la barra y se lea cortada.
//   2. Que la banda se dibuje ENCIMA de la barra de chips al cruzarse. La
//      banda es z-10 y la barra z-20 justamente para que pase por debajo, pero
//      un z-index mal puesto no se nota hasta que alguien desplaza la carta.
//
// Se replica la estructura real (main > barra sticky + secciones con banda) y
// se mide en Chromium en 40 posiciones de desplazamiento.
import pkg from "/home/claude/.npm-global/lib/node_modules/playwright/index.js";
const { chromium } = pkg;

const PAGINA = `
<style>
  *{box-sizing:border-box;margin:0} body{font-family:system-ui}
  main{margin:0 auto;max-width:42rem;padding:0 1rem 8rem}
  .barra{position:sticky;top:0;z-index:20;margin:0 -1rem;border-bottom:1px solid #E4E4E6;
         background:rgba(255,255,255,.95);padding:10px 1rem}
  .chip{display:inline-block;border:1px solid #E4E4E6;border-radius:99px;padding:6px 12px;font-size:13px}
  .secs{display:flex;flex-direction:column}
  section{padding-top:1.5rem}
  .banda{position:sticky;z-index:10;margin:0 -1rem;background:#F7D9CB;padding:10px 1rem}
  h2{font-size:16.8px;font-weight:600;color:#A33A14}
  .sub{font-size:12px;color:#A33A14}
  .fila{height:76px;border-bottom:1px solid #EFEFF0}
</style>
<main>
  <div class="barra" id="barra"><span class="chip">Hamburguesas</span> <span class="chip">Empanadas</span></div>
  <div class="secs" id="secs"></div>
</main>
<script>
  const G=[["Hamburguesas Simple",8],["Empanadas",6],["Bebidas",5]];
  // Igual que en Carta.tsx: el top sale de medir la barra, no de un número fijo.
  const alto=document.getElementById("barra").getBoundingClientRect().height;
  document.getElementById("secs").innerHTML=G.map(([n,k],i)=>
    '<section><div class="banda" style="top:'+alto+'px"><h2>'+n+'</h2><div class="sub">'+k+' opciones</div></div>'+
    Array.from({length:k},(_,j)=>'<div class="fila">Producto '+(j+1)+'</div>').join("")+'</section>').join("");
</script>`;

const navegador = await chromium.launch();
const pagina = await navegador.newPage({ viewport: { width: 390, height: 740 } });
await pagina.setContent(PAGINA);

let fallos = 0;
const decir = (ok, texto) => {
  if (!ok) fallos++;
  console.log(`  ${ok ? "✓" : "✗"} ${texto}`);
};

// 1) La barra de chips siempre se dibuja arriba de la banda.
let tapadas = [];
for (let y = 0; y < 2400; y += 60) {
  await pagina.evaluate((v) => window.scrollTo(0, v), y);
  const quien = await pagina.evaluate(() => {
    const r = document.getElementById("barra").getBoundingClientRect();
    const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    if (!el) return "nada";
    return el.closest(".banda") ? "BANDA" : el.closest(".barra") ? "barra" : el.tagName;
  });
  if (quien !== "barra") tapadas.push(y);
}
decir(tapadas.length === 0, `la banda pasa por debajo de la barra de chips (40 posiciones)`);

// 2) Pegada, queda al ras de la barra: sin hueco y sin meterse abajo.
await pagina.evaluate(() => window.scrollTo(0, 1200));
const hueco = await pagina.evaluate(() => {
  const barra = document.getElementById("barra").getBoundingClientRect();
  const peg = [...document.querySelectorAll(".banda")]
    .map((e) => e.getBoundingClientRect())
    .filter((x) => x.bottom > barra.bottom && x.top < barra.bottom + 4)[0];
  return peg ? peg.top - barra.bottom : null;
});
decir(hueco !== null && Math.abs(hueco) < 1.5, `queda al ras de la barra (hueco: ${hueco?.toFixed(1)}px)`);

// 3) Nunca hay dos bandas pegadas a la vez (una empuja a la otra).
let dobles = 0;
for (let y = 0; y < 2400; y += 40) {
  await pagina.evaluate((v) => window.scrollTo(0, v), y);
  const n = await pagina.evaluate(() => {
    const b = document.getElementById("barra").getBoundingClientRect().bottom;
    return [...document.querySelectorAll(".banda")]
      .filter((e) => Math.abs(e.getBoundingClientRect().top - b) < 1.5).length;
  });
  if (n > 1) dobles++;
}
decir(dobles === 0, `nunca se pegan dos bandas al mismo tiempo`);

await navegador.close();
console.log(fallos === 0 ? "\n  ✓ la banda se pega bien" : `\n  ✗ ${fallos} fallo(s)`);
process.exit(fallos === 0 ? 0 : 1);
