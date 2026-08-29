// El cierre de caja del repartidor.
//
// Lo que se prueba acá es plata, así que las pruebas son más desconfiadas que
// de costumbre: importa sobre todo que NADA se pierda por el camino y que un
// dato raro mandado desde el teléfono no haga desaparecer un pedido cobrado.
import {
  resumirCierre,
  normalizarCobro,
  rindeEfectivo,
  etiquetaDeCobro,
  contrastarRendicion,
} from "./compilado/rendicion.mjs";

let bien = 0, mal = 0;
function igual(titulo, dio, esperaba) {
  const ok = JSON.stringify(dio) === JSON.stringify(esperaba);
  if (ok) bien++;
  else { mal++; console.log(`  ✗ ${titulo}\n      dio:      ${JSON.stringify(dio)}\n      esperaba: ${JSON.stringify(esperaba)}`); }
}
const p = (numero, total, cobroMetodo) => ({ id: "o" + numero, numero, total, cobroMetodo });

// ---------------------------------------------------------------- lo básico
igual("sin pedidos, todo en cero", (() => { const r = resumirCierre([]); return [r.cantidad, r.efectivo, r.otros]; })(), [0, 0, 0]);

const vuelta = resumirCierre([
  p(1, 50000, "efectivo"),
  p(2, 30000, "tarjeta"),
  p(3, 45000, "efectivo"),
  p(4, 25000, "transferencia"),
  p(5, 60000, "ya_pagado"),
]);
igual("cinco pedidos: cantidad", vuelta.cantidad, 5);
igual("solo el efectivo se rinde", vuelta.efectivo, 95000);
igual("lo demás va aparte", vuelta.otros, 115000);
igual("el total es la suma de los dos", vuelta.total, 210000);
igual("nada se pierde", vuelta.efectivo + vuelta.otros,
      50000 + 30000 + 45000 + 25000 + 60000);

// ---------------------------------------------------------------- el desglose
igual("el efectivo va primero en el desglose", vuelta.porMetodo[0].metodo, "efectivo");
igual("agrupa los dos pedidos en efectivo", vuelta.porMetodo[0].cantidad, 2);
igual("solo aparecen los métodos usados", vuelta.porMetodo.length, 4);
igual("la suma del desglose da el total",
      vuelta.porMetodo.reduce((s, m) => s + m.monto, 0), 210000);
igual("la suma de cantidades da la cantidad",
      vuelta.porMetodo.reduce((s, m) => s + m.cantidad, 0), 5);

// ------------------------------------------------- datos raros: no se pierden
igual("un método desconocido cuenta como efectivo",
      resumirCierre([p(1, 40000, "criptomonedas")]).efectivo, 40000);
igual("sin método cuenta como efectivo",
      resumirCierre([p(1, 40000, null)]).efectivo, 40000);
igual("vacío cuenta como efectivo",
      resumirCierre([p(1, 40000, "")]).efectivo, 40000);
igual("MAYÚSCULAS se entienden igual",
      resumirCierre([p(1, 40000, "TARJETA")]).efectivo, 0);
igual("con espacios también",
      resumirCierre([p(1, 40000, "  tarjeta  ")]).otros, 40000);

// Prisma devuelve Decimal como string: si no se convierte, "50000" + "45000"
// da "5000045000" y el cierre pide una fortuna.
igual("montos como texto (así los da la base)",
      resumirCierre([p(1, "50000", "efectivo"), p(2, "45000", "efectivo")]).efectivo, 95000);
igual("un monto roto no ensucia la cuenta",
      resumirCierre([p(1, "no-es-un-numero", "efectivo"), p(2, 30000, "efectivo")]).efectivo, 30000);

// Prisma NO devuelve number ni string: devuelve un objeto Decimal. Esto es lo
// que rompió el build — las pruebas pasaban porque acá los montos se escriben
// a mano. Se imita el objeto para que la prueba se parezca a la realidad.
const decimalFalso = (n) => ({ toString: () => String(n) });
igual("montos como objeto Decimal (lo que da Prisma de verdad)",
      resumirCierre([
        { id: "o1", numero: 1, total: decimalFalso(50000), cobroMetodo: "efectivo" },
        { id: "o2", numero: 2, total: decimalFalso(45000), cobroMetodo: "efectivo" },
      ]).efectivo, 95000);
igual("Decimal con decimales",
      resumirCierre([{ id: "o1", numero: 1, total: decimalFalso("1500.50"), cobroMetodo: "efectivo" }]).efectivo, 1500.5);

// ------------------------------------------------------------ piezas sueltas
igual("normalizar respeta lo válido", normalizarCobro("transferencia"), "transferencia");
igual("normalizar cae en efectivo", normalizarCobro("cualquier cosa"), "efectivo");
igual("el efectivo rinde", rindeEfectivo("efectivo"), true);
igual("la tarjeta no rinde", rindeEfectivo("tarjeta"), false);
igual("ya pagado no rinde", rindeEfectivo("ya_pagado"), false);
igual("un método raro se trata como efectivo", rindeEfectivo("???"), true);
igual("etiqueta legible", etiquetaDeCobro("ya_pagado"), "Ya estaba pago");

// ------------------------------------------- el comprobante ya cerrado
// La hoja que se imprime cuando el repartidor ya entregó la plata. El número
// que vale es el que quedó guardado ese día; esto solo mira si los pedidos
// siguen diciendo lo mismo, para poder avisarlo en el papel.
const rendidos = [p(1, 50000, "efectivo"), p(2, 30000, "tarjeta"), p(3, 45000, "efectivo")];
const congelada = { cantidadPedidos: 3, totalEfectivo: 95000, totalOtros: 30000 };

const sinTocar = contrastarRendicion(rendidos, congelada);
igual("un comprobante intacto coincide", sinTocar.coincide, true);
igual("informa lo que se recibió aquel día", sinTocar.efectivoRendido, 95000);
igual("y lo que dicen los pedidos hoy", sinTocar.efectivoAhora, 95000);

// Alguien corrigió el precio de un pedido después de recibir la plata: el
// comprobante NO cambia, pero la hoja tiene que poder decirlo.
const editado = contrastarRendicion(
  [p(1, 50000, "efectivo"), p(2, 30000, "tarjeta"), p(3, 70000, "efectivo")],
  congelada
);
igual("un pedido editado después rompe la coincidencia", editado.coincide, false);
igual("el monto recibido NO se mueve", editado.efectivoRendido, 95000);
igual("y se ve cuánto daría hoy", editado.efectivoAhora, 120000);

igual(
  "si falta un pedido de la rendición, tampoco coincide",
  contrastarRendicion([p(1, 50000, "efectivo"), p(2, 30000, "tarjeta")], congelada).coincide,
  false
);
// El caso peligroso: falta un pedido que se cobró con TARJETA. El efectivo da
// exactamente igual, así que mirar solo el monto no lo agarra — hay que
// comparar también cuántos pedidos son.
igual(
  "si falta un pedido que no era efectivo, el monto coincide pero la rendición no",
  contrastarRendicion([p(1, 50000, "efectivo"), p(3, 45000, "efectivo")], congelada).coincide,
  false
);
igual(
  "medio guaraní de redondeo no cuenta como edición",
  contrastarRendicion(rendidos, { ...congelada, totalEfectivo: 95000.4 }).coincide,
  true
);

// Prisma devuelve los Decimal como objeto. Además de que la comparación dé
// bien, el monto que sale impreso tiene que ser un número: si saliera el
// objeto, la hoja quedaría a merced de cómo lo convierta cada formateador.
const desdeDecimal = contrastarRendicion(rendidos, {
  ...congelada,
  totalEfectivo: { toString: () => "95000" },
});
igual("los montos congelados también pueden llegar como Decimal de Prisma", desdeDecimal.coincide, true);
igual("y el monto que se imprime ya viene convertido a número", typeof desdeDecimal.efectivoRendido, "number");
igual("con el valor correcto", desdeDecimal.efectivoRendido, 95000);
igual(
  "una rendición sin pedidos a la vista se nota",
  contrastarRendicion([], congelada).coincide,
  false
);

console.log(mal === 0 ? `  ✓ ${bien} pruebas pasaron` : `  ✗ ${mal} fallaron de ${bien + mal}`);
process.exit(mal === 0 ? 0 : 1);
