// ===========================================================================
//  Qué pasa con el foco y el scroll al mover una fila de la lista
// ===========================================================================
//  Se corre en Chromium de verdad. La maqueta imita a React con exactitud:
//  NO rehace el HTML (eso siempre pierde el foco y no es lo que hace React con
//  listas con key), sino que mueve el nodo existente y solo cambia el atributo
//  disabled — que es la reconciliación real de React.
//
//  Esta prueba nació de una hipótesis MÍA que resultó FALSA: creí que el salto
//  de la barra de desplazamiento lo causaba deshabilitar el botón enfocado.
//  Medido, el scroll no se mueve ni un píxel en ninguna variante. Lo que sí
//  pasa es que el foco se cae al <body>, y eso sí se arregla acá.
//
//    node pruebas/foco-al-mover.mjs
// ===========================================================================
import pkg from "/home/claude/.npm-global/lib/node_modules/playwright/index.js";
const { chromium } = pkg;

const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const FILAS = 30;

const pagina = `
<style>body{margin:0;font:16px sans-serif}.fila{height:70px;border-bottom:1px solid #ddd;padding:8px}</style>
<div id="lista"></div>
<script>
  const lista = document.getElementById("lista");
  for (let i = 0; i < ${FILAS}; i++) {
    const fila = document.createElement("div");
    fila.className = "fila";
    fila.innerHTML = '<button class="sube">▲</button><button class="baja">▼</button> Categoria ' + (i+1);
    lista.appendChild(fila);
  }
  function actualizarBotones() {
    const filas = [...lista.children];
    filas.forEach((f, i) => {
      f.querySelector(".sube").disabled = i === 0;
      f.querySelector(".baja").disabled = i === filas.length - 1;
    });
  }
  actualizarBotones();

  window.mover = async (indice, dir) => {
    await new Promise(r => setTimeout(r, 120));      // el viaje al servidor
    const filas = [...lista.children];
    const destino = dir === "arriba" ? indice - 1 : indice + 1;
    if (destino >= 0 && destino < filas.length) {
      dir === "arriba" ? lista.insertBefore(filas[indice], filas[destino])
                       : lista.insertBefore(filas[destino], filas[indice]);
    }
    actualizarBotones();
  };
</script>`;

const navegador = await chromium.launch({ executablePath: CHROME });
let ok = 0; const fallas = [];
const chequear = (t, c) => (c ? ok++ : fallas.push(t));

async function correr(devolverElFoco) {
  const pag = await navegador.newPage({ viewport: { width: 400, height: 600 } });
  await pag.setContent(pagina);
  await pag.evaluate(() => window.scrollTo(0, 900));
  const antes = await pag.evaluate(() => window.scrollY);

  const resultado = await pag.evaluate(async (devolver) => {
    // El caso real: mandar una categoría al último lugar. El botón apretado
    // termina deshabilitado, porque ya no se puede bajar más.
    const fila = document.querySelectorAll(".fila")[28];
    const baja = fila.querySelector(".baja");
    // preventScroll acá porque el usuario hace CLIC en un botón que ya está a
    // la vista; sin esto la prueba mediría su propio scroll y no el del bug.
    baja.focus({ preventScroll: true });
    await window.mover(28, "abajo");
    if (devolver) {
      const destino = baja.disabled ? fila.querySelector(".sube") : baja;
      destino.focus({ preventScroll: true });
    }
    return {
      foco: document.activeElement === document.body ? "BODY" : document.activeElement.className,
      llegoAlFinal: [...document.querySelectorAll(".fila")].at(-1).contains(baja),
    };
  }, devolverElFoco);

  await pag.waitForTimeout(150);
  const despues = await pag.evaluate(() => window.scrollY);
  await pag.close();
  return { antes, despues, ...resultado };
}

const sinArreglo = await correr(false);
const conArreglo = await correr(true);

console.log(`  sin devolver el foco:  scroll ${sinArreglo.antes}→${sinArreglo.despues}   foco: ${sinArreglo.foco}`);
console.log(`  devolviendo el foco:   scroll ${conArreglo.antes}→${conArreglo.despues}   foco: ${conArreglo.foco}`);

chequear("la fila efectivamente llegó al último lugar", sinArreglo.llegoAlFinal);

// El hallazgo que corrige la hipótesis: mover una fila NO mueve la página.
chequear("mover una fila no mueve el scroll", sinArreglo.antes === sinArreglo.despues);
chequear("el arreglo tampoco mueve el scroll", conArreglo.antes === conArreglo.despues);

// El defecto real: el botón queda deshabilitado y el foco se cae al body.
chequear("sin arreglo, el foco se pierde al <body>", sinArreglo.foco === "BODY");
chequear("con arreglo, el foco queda en un botón usable", conArreglo.foco === "sube");

console.log(`\n  ${fallas.length ? "✗" : "✓"} ${ok} comprobaciones, ${fallas.length} fallaron`);
for (const f of fallas) console.log("     ✗ " + f);
await navegador.close();
process.exit(fallas.length ? 1 : 0);
