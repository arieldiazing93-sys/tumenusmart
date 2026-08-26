/**
 * Pruebas de las reglas de vencimiento.
 *
 * Esto decide si el negocio de un cliente atiende o no atiende, así que la
 * frontera de la medianoche tiene que estar exacta. Un error de una hora acá
 * significa un local apagado cuando todavía tenía derecho a atender.
 *
 *   npx tsc src/lib/suscripcion.ts src/lib/timezone.ts --ignoreConfig \
 *       --outDir /tmp/sus --target es2020 --module esnext \
 *       --moduleResolution bundler --skipLibCheck
 *   (renombrar a .mjs y ajustar el import)
 *   node pruebas/suscripcion.mjs
 */

import {
  momentoDeCorte,
  estaVencido,
  diasHastaVencer,
  estadoSuscripcion,
  calcularNuevoVencimiento,
  mensajeRecordatorio,
} from "/tmp/sus/suscripcion.mjs";

const ZONA = "America/Asuncion";
let bien = 0, mal = 0;
const fallos = [];

function afirmar(nombre, cond, detalle = "") {
  cond ? bien++ : (mal++, fallos.push(nombre + (detalle ? "  -> " + detalle : "")));
  console.log(`  ${cond ? "OK   " : "MAL  "} ${nombre}${cond || !detalle ? "" : "  -> " + detalle}`);
}
const seccion = (t) => console.log("\n" + t);

/** Un instante expresado en hora de Asunción (UTC-3). */
const enAsuncion = (texto) => new Date(texto + "-03:00");

// ===========================================================================
seccion("1. La frontera de la medianoche — lo crítico");
// ===========================================================================

{
  // Vencimiento: 30 de septiembre. Debe atender TODO el 30.
  const vence = enAsuncion("2026-09-30T00:00:00");
  const corte = momentoDeCorte(vence, ZONA);

  afirmar(
    "el corte es la medianoche del 1 de octubre en Asuncion",
    corte.toISOString() === "2026-10-01T03:00:00.000Z",
    corte.toISOString()
  );

  afirmar("el 30 a las 08:00 todavia atiende", !estaVencido(vence, enAsuncion("2026-09-30T08:00:00"), ZONA));
  afirmar("el 30 a las 23:59 TODAVIA atiende", !estaVencido(vence, enAsuncion("2026-09-30T23:59:00"), ZONA));
  afirmar("el 1 a las 00:01 ya no atiende", estaVencido(vence, enAsuncion("2026-10-01T00:01:00"), ZONA));
  afirmar("el 1 a las 09:00 no atiende", estaVencido(vence, enAsuncion("2026-10-01T09:00:00"), ZONA));

  // El caso que más importa: un sábado a la noche en pleno servicio.
  afirmar(
    "un sabado 22:30 del dia del vencimiento sigue tomando pedidos",
    !estaVencido(vence, enAsuncion("2026-09-30T22:30:00"), ZONA)
  );
}

{
  // Un vencimiento guardado con hora (no a medianoche) no debe cambiar nada:
  // lo que manda es el DIA.
  const conHora = enAsuncion("2026-09-30T17:45:00");
  afirmar(
    "la hora guardada en el vencimiento no altera el corte",
    momentoDeCorte(conHora, ZONA).toISOString() === "2026-10-01T03:00:00.000Z",
    momentoDeCorte(conHora, ZONA).toISOString()
  );
}

{
  afirmar("sin fecha de vencimiento nunca esta vencido", !estaVencido(null, new Date(), ZONA));
}

// ===========================================================================
seccion("2. Cuántos días faltan");
// ===========================================================================

{
  const vence = enAsuncion("2026-09-30T00:00:00");
  afirmar("el mismo dia del vencimiento queda 1 dia", diasHastaVencer(vence, enAsuncion("2026-09-30T10:00:00"), ZONA) === 1,
    String(diasHastaVencer(vence, enAsuncion("2026-09-30T10:00:00"), ZONA)));
  afirmar("el dia anterior quedan 2", diasHastaVencer(vence, enAsuncion("2026-09-29T10:00:00"), ZONA) === 2,
    String(diasHastaVencer(vence, enAsuncion("2026-09-29T10:00:00"), ZONA)));
  afirmar("una semana antes quedan 8", diasHastaVencer(vence, enAsuncion("2026-09-23T10:00:00"), ZONA) === 8,
    String(diasHastaVencer(vence, enAsuncion("2026-09-23T10:00:00"), ZONA)));
  afirmar("pasado el corte da cero o negativo", diasHastaVencer(vence, enAsuncion("2026-10-02T10:00:00"), ZONA) <= 0);
}

// ===========================================================================
seccion("3. Cómo se muestra el estado");
// ===========================================================================

{
  const ahora = enAsuncion("2026-09-20T10:00:00");
  const est = (venc, estado = "activo") =>
    estadoSuscripcion({ estado, vencimiento: venc }, ahora, ZONA);

  afirmar("suspendido a mano manda sobre la fecha",
    est(enAsuncion("2026-12-31T00:00:00"), "suspendido").clase === "suspendido");
  afirmar("sin fecha se marca aparte", est(null).clase === "sin_vencimiento");
  afirmar("faltando 3 dias avisa", est(enAsuncion("2026-09-22T00:00:00")).clase === "por_vencer",
    est(enAsuncion("2026-09-22T00:00:00")).clase);
  afirmar("faltando 30 dias esta al dia", est(enAsuncion("2026-10-20T00:00:00")).clase === "al_dia");
  afirmar("pasado el corte esta vencido", est(enAsuncion("2026-09-10T00:00:00")).clase === "vencido");
  afirmar("dice 'Vence manana' cuando corresponde",
    est(enAsuncion("2026-09-20T00:00:00")).etiqueta === "Vence mañana",
    est(enAsuncion("2026-09-20T00:00:00")).etiqueta);
  afirmar("cuenta los dias vencidos",
    est(enAsuncion("2026-09-15T00:00:00")).etiqueta.includes("hace"),
    est(enAsuncion("2026-09-15T00:00:00")).etiqueta);
}

// ===========================================================================
seccion("4. Registrar un pago");
// ===========================================================================

{
  const ahora = enAsuncion("2026-09-10T14:00:00");
  const dia = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

  // Paga adelantado: los meses se suman a lo que ya tenía, no se pierde nada.
  const alDia = enAsuncion("2026-09-30T00:00:00");
  const r1 = calcularNuevoVencimiento(alDia, 1, ahora, ZONA);
  afirmar("pagar antes de vencer SUMA al vencimiento actual", dia(r1) === "2026-10-30", dia(r1));

  // Ya vencido: se cuenta desde hoy.
  const vencido = enAsuncion("2026-08-01T00:00:00");
  const r2 = calcularNuevoVencimiento(vencido, 1, ahora, ZONA);
  afirmar("si ya estaba vencido cuenta desde hoy", dia(r2) === "2026-10-10", dia(r2));

  // Primer pago, sin vencimiento previo.
  const r3 = calcularNuevoVencimiento(null, 1, ahora, ZONA);
  afirmar("el primer pago cuenta desde hoy", dia(r3) === "2026-10-10", dia(r3));

  // Varios meses de una.
  const r4 = calcularNuevoVencimiento(null, 6, ahora, ZONA);
  afirmar("seis meses de una vez", dia(r4) === "2027-03-10", dia(r4));

  // Fin de mes: 31 de enero + 1 mes no puede caer en marzo.
  const finDeMes = enAsuncion("2026-01-31T00:00:00");
  const r5 = calcularNuevoVencimiento(finDeMes, 1, enAsuncion("2026-01-15T00:00:00"), ZONA);
  afirmar("31 de enero + 1 mes cae en febrero, no en marzo", dia(r5) === "2026-02-28", dia(r5));

  // Y el pago no puede hacer retroceder un vencimiento.
  const r6 = calcularNuevoVencimiento(alDia, 1, ahora, ZONA);
  afirmar("un pago nunca acorta el plazo que ya tenia", r6.getTime() > alDia.getTime());
}

// ===========================================================================
seccion("5. El mensaje de recordatorio");
// ===========================================================================

{
  const vencido = { clase: "vencido", dias: 3, etiqueta: "" };
  const porVencer = { clase: "por_vencer", dias: 2, etiqueta: "" };
  const manana = { clase: "por_vencer", dias: 1, etiqueta: "" };

  afirmar("al vencido le explica que el menu se apago",
    mensajeRecordatorio("Mas Pizza", vencido).includes("dejó de tomar pedidos"));
  afirmar("al vencido le dice que vuelve al instante",
    mensajeRecordatorio("Mas Pizza", vencido).includes("al instante"));
  afirmar("al que esta por vencer le dice cuantos dias",
    mensajeRecordatorio("Mas Pizza", porVencer).includes("en 2 días"),
    mensajeRecordatorio("Mas Pizza", porVencer));
  afirmar("usa 'mañana' cuando queda un dia",
    mensajeRecordatorio("Mas Pizza", manana).includes("mañana"));
  afirmar("siempre nombra al local",
    mensajeRecordatorio("Mas Pizza", vencido).includes("Mas Pizza"));
  afirmar("nunca suena amenazante",
    !/deuda|moroso|corte inmediato|reclamo/i.test(mensajeRecordatorio("Mas Pizza", vencido)));
}

console.log(`\n  TOTAL: ${bien} bien, ${mal} mal`);
if (fallos.length) {
  console.log("\n  Fallaron:");
  for (const f of fallos) console.log("    - " + f);
}
process.exit(mal ? 1 : 0);
