// Pruebas del mensaje que se manda por WhatsApp.
//
// Este texto es lo ÚNICO que ve el negocio de un pedido antes de prepararlo.
// Un dato faltante o una línea confusa acá cuesta una entrega mal hecha.
//
//   node pruebas/whatsapp.mjs

import { construirMensajePedido, normalizarTelefonoParaWhatsapp } from "./compilado/whatsapp.mjs";

let ok = 0;
const fallas = [];
const cierto = (t, c) => (c ? ok++ : fallas.push(t));
const igual = (t, a, b) => (a === b ? ok++
  : fallas.push(`${t}\n     esperaba ${JSON.stringify(b)}\n     obtuve   ${JSON.stringify(a)}`));

const BASE = {
  numero: 28,
  clienteNombre: "Ariel",
  clienteTelefono: "0984792335",
  items: [{ nombreProducto: "Pizza Mexicana Grande", cantidad: 2, precioUnitario: 85000 }],
  total: 170000,
  metodoPago: "efectivo",
};

console.log("\n— la dirección del delivery —");
const conReferencia = construirMensajePedido({
  ...BASE, tipoEntrega: "delivery", direccion: "Casa portón verde", clienteLat: -25.3, clienteLng: -57.6,
});
cierto("con referencia, la muestra", conReferencia.includes("Entrega a domicilio: Casa portón verde"));
cierto("y además manda el mapa", conReferencia.includes("google.com/maps?q=-25.3,-57.6"));

// El caso nuevo: el cliente solo marcó el pin y no escribió nada.
const soloPin = construirMensajePedido({
  ...BASE, tipoEntrega: "delivery", direccion: "", clienteLat: -25.3, clienteLng: -57.6,
});
cierto("sin referencia NO deja un guion suelto", !soloPin.includes("Entrega a domicilio: -"));
cierto("sin referencia manda a mirar el mapa", soloPin.includes("ver ubicación abajo"));
cierto("y el mapa está de verdad", soloPin.includes("google.com/maps?q="));

// Espacios en blanco cuentan como vacío: si no, "Entrega a domicilio:    ".
const soloEspacios = construirMensajePedido({
  ...BASE, tipoEntrega: "delivery", direccion: "   ", clienteLat: -25.3, clienteLng: -57.6,
});
cierto("una referencia de puros espacios se trata como vacía",
  soloEspacios.includes("ver ubicación abajo"));

const nula = construirMensajePedido({
  ...BASE, tipoEntrega: "delivery", direccion: null, clienteLat: -25.3, clienteLng: -57.6,
});
cierto("referencia nula tampoco rompe", nula.includes("ver ubicación abajo"));

console.log("— retiro en el local —");
const retiro = construirMensajePedido({ ...BASE, tipoEntrega: "retiro" });
cierto("dice retiro", retiro.includes("Retiro en el local"));
cierto("y no habla de domicilio", !retiro.includes("Entrega a domicilio"));
cierto("ni manda mapa", !retiro.includes("google.com/maps"));

console.log("— lo que nunca puede faltar —");
for (const [que, texto] of [
  ["el número de pedido", "0028"],
  ["el nombre del cliente", "Ariel"],
  ["el producto", "Pizza Mexicana Grande"],
  ["el total", "170.000"],
]) {
  cierto(`el mensaje incluye ${que}`, conReferencia.includes(texto));
}

console.log("— el teléfono para WhatsApp —");
igual("agrega el código de país", normalizarTelefonoParaWhatsapp("0984792335"), "595984792335");
igual("sin el cero inicial también", normalizarTelefonoParaWhatsapp("984792335"), "595984792335");
igual("ya con código, no lo duplica", normalizarTelefonoParaWhatsapp("595984792335"), "595984792335");
igual("limpia espacios y guiones", normalizarTelefonoParaWhatsapp("0984 79-2335"), "595984792335");

console.log(`\n${fallas.length === 0 ? "✓" : "✗"} ${ok} comprobaciones, ${fallas.length} fallaron`);
for (const f of fallas) console.log("   ✗ " + f);
process.exit(fallas.length === 0 ? 0 : 1);
