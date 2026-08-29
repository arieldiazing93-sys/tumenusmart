// La jornada de trabajo, que NO es un día del calendario.
//
// El caso que originó todo: el turno arranca el 29 a la tarde y los últimos
// pedidos se entregan a las 2 de la madrugada del 30. Filtrando "el día 29"
// esas entregas quedan afuera y el repartidor rinde de menos.
//
// Todo se calcula en hora de Asunción (UTC-3), así que las horas UTC de acá
// abajo están corridas tres horas a propósito.
import { jornadaDe, jornadaAnterior, dentroDelRango, revisarRango, HORA_CORTE }
  from "./compilado/turno.mjs";

let bien = 0, mal = 0;
function igual(titulo, dio, esperaba) {
  const ok = String(dio) === String(esperaba);
  if (ok) bien++;
  else { mal++; console.log(`  ✗ ${titulo}\n      dio:      ${dio}\n      esperaba: ${esperaba}`); }
}
const diaAsu = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Asuncion" }).format(d);
const horaAsu = (d) => new Intl.DateTimeFormat("en-GB",
  { timeZone: "America/Asuncion", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);

igual("el corte es a las 6", HORA_CORTE, 6);

// ---- Un pedido entregado el 29 a las 21:00 de Asunción (= 30 a las 00:00 UTC)
const nocheDel29 = new Date("2026-08-30T00:00:00Z");
const j1 = jornadaDe(nocheDel29);
igual("la jornada arranca a las 06:00", horaAsu(j1.desde), "06:00");
igual("una entrega de las 21 del 29 pertenece a la jornada del 29", diaAsu(j1.desde), "2026-08-29");
igual("y termina el día siguiente", diaAsu(j1.hasta), "2026-08-30");

// ---- EL CASO: 2 de la madrugada del 30, todavía trabajando la noche del 29
const madrugadaDel30 = new Date("2026-08-30T05:00:00Z"); // 02:00 en Asunción
const j2 = jornadaDe(madrugadaDel30);
igual("a las 2 de la madrugada del 30 todavía es la jornada del 29", diaAsu(j2.desde), "2026-08-29");
igual("es LA MISMA jornada que la de las 21", j2.desde.getTime(), j1.desde.getTime());

// ---- Después del corte ya es otra jornada
const mananaDel30 = new Date("2026-08-30T11:00:00Z"); // 08:00 en Asunción
igual("a las 8 de la mañana del 30 ya es la jornada del 30",
      diaAsu(jornadaDe(mananaDel30).desde), "2026-08-30");

// ---- Justo en el borde
igual("a las 6:00 en punto ya empezó la jornada nueva",
      diaAsu(jornadaDe(new Date("2026-08-30T09:00:00Z")).desde), "2026-08-30");
igual("a las 5:59 todavía es la anterior",
      diaAsu(jornadaDe(new Date("2026-08-30T08:59:00Z")).desde), "2026-08-29");

// ---- La jornada anterior pega justo, sin huecos ni superposición
const ja = jornadaAnterior(nocheDel29);
igual("la anterior termina donde empieza la actual", ja.hasta.getTime(), j1.desde.getTime());
igual("y dura 24 horas", (ja.hasta - ja.desde) / 3600000, 24);

// ---- Un pedido no puede caer en dos jornadas (o se rendiría dos veces)
const enElBorde = new Date("2026-08-29T09:00:00Z"); // 06:00 del 29
igual("el pedido del borde NO cuenta en la jornada anterior", dentroDelRango(enElBorde, ja), false);
igual("el pedido del borde SÍ cuenta en la actual", dentroDelRango(enElBorde, j1), true);
igual("sin rango, entra todo", dentroDelRango(enElBorde, null), true);
igual("sin fecha de entrega, no entra en un rango", dentroDelRango(null, j1), false);

// ---- Validación de lo escrito a mano
igual("faltan fechas", revisarRango(null, new Date()), "Poné las dos fechas, desde y hasta.");
igual("fin antes que inicio",
      revisarRango(new Date("2026-08-30T00:00:00Z"), new Date("2026-08-29T00:00:00Z")),
      "La fecha de fin tiene que ser posterior a la de inicio.");
igual("iguales tampoco sirve",
      revisarRango(new Date("2026-08-30T00:00:00Z"), new Date("2026-08-30T00:00:00Z")),
      "La fecha de fin tiene que ser posterior a la de inicio.");
igual("un rango normal pasa",
      revisarRango(new Date("2026-08-29T09:00:00Z"), new Date("2026-08-30T09:00:00Z")), null);
igual("un año de más se caza",
      revisarRango(new Date("2025-08-29T00:00:00Z"), new Date("2026-08-30T00:00:00Z")),
      "Ese rango es de más de 45 días. Revisá las fechas.");

console.log(mal === 0 ? `  ✓ ${bien} pruebas pasaron` : `  ✗ ${mal} fallaron de ${bien + mal}`);
process.exit(mal === 0 ? 0 : 1);
