// ===========================================================================
//  Contraste de las pastillas de estado
// ===========================================================================
//  Cada estado es texto chico sobre un fondo de color. Si el contraste baja de
//  4.5:1, quien no ve del todo bien no lo lee — y el estado del pedido es
//  justamente lo que hay que leer de un vistazo.
//
//  Los colores se leen del config compilado, así que si alguien cambia un tono
//  y rompe el contraste, esto falla.
//
//    node pruebas/contraste-estados.mjs
// ===========================================================================
const { default: config } = await import("./compilado/tailwind.config.mjs");
const c = config.theme.extend.colors;

const MINIMO = 4.5;

function luminancia(hex) {
  const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const l = v.map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2];
}
function contraste(a, b) {
  const [alto, bajo] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (alto + 0.05) / (bajo + 0.05);
}

const PARES = [
  ["Por confirmar", c.aviso.tinte, c.aviso.DEFAULT],
  ["Confirmado", c.azul.tinte, c.azul.oscuro],
  ["En preparación", c.brand.tinte, c.brand.texto],
  ["En despacho", c.violeta.tinte, c.violeta.oscuro],
  ["Entregado", c.exito.tinte, c.exito.DEFAULT],
  ["Cancelado", c.peligro.tinte, c.peligro.DEFAULT],
  // Los carteles de aviso usan el fondo claro, no el tinte.
  ["Cartel de aviso", c.aviso.luz, c.aviso.DEFAULT],
  ["Cartel de éxito", c.exito.luz, c.exito.DEFAULT],
  ["Cartel de peligro", c.peligro.luz, c.peligro.DEFAULT],
  ["Botón volver", c.azul.luz, c.azul.oscuro],
];

const fallas = [];
for (const [nombre, fondo, texto] of PARES) {
  const r = contraste(fondo, texto);
  const ok = r >= MINIMO;
  console.log(`  ${ok ? "✓" : "✗"} ${nombre.padEnd(18)} ${r.toFixed(2)}:1   ${texto} sobre ${fondo}`);
  if (!ok) fallas.push(`${nombre}: ${r.toFixed(2)}:1 (mínimo ${MINIMO})`);
}

console.log(`\n  ${fallas.length ? "✗" : "✓"} ${PARES.length - fallas.length}/${PARES.length} pares legibles`);
for (const f of fallas) console.log("     ✗ " + f);
process.exit(fallas.length ? 1 : 0);
