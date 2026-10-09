/**
 * Autocontrol de las cuentas del Documento Electrónico.
 *
 * La DNIT recalcula cada monto al recibir un documento y lo rechaza si no cierra (con un margen de ±0,50 Gs. por
 * redondeo, Manual Técnico sección 12). Este control hace ANTES las mismas cuentas, leyendo solo los números que ya
 * están dentro del documento: si el armado se equivocó en algo, se entera nuestro sistema y no la DNIT.
 *
 * Fórmulas del Manual Técnico v150 con las notas técnicas 1, 12 y 13 aplicadas:
 *  - E727  total bruto del ítem = precio × cantidad
 *  - EA008 total del ítem = (precio − descuento particular − descuento global − anticipos) × cantidad
 *  - EA004 el descuento global por unidad concuerda con el porcentaje global F010 (hasta 0,8 de diferencia)
 *  - E735  base gravada = [100 × EA008 × proporción] / [10000 + tasa × proporción]
 *  - E736  liquidación del IVA = base × tasa / 100
 *  - F002…F005 subtotales por tasa, F008 total bruto, F009/F033/F011 descuentos, F014 total general,
 *    F015/F016/F017 liquidaciones, F018/F019/F020 bases gravadas.
 */

import type { Nodo, Valor } from "./xml";

/** ±50 céntimos: lo que acepta la DNIT en cualquier cálculo. */
const TOLERANCIA = 0.5 + 1e-9;
/** Diferencia aceptada entre el porcentaje de descuento de un ítem y el global. */
const TOLERANCIA_PORCENTAJE = 0.8;

const num = (v: Valor): number => (v === undefined || v === null || v === "" ? 0 : Number(v));
const nodo = (v: Valor): Nodo => (v && typeof v === "object" && !Array.isArray(v) ? (v as Nodo) : {});
const lista = (v: Valor): Nodo[] => (Array.isArray(v) ? (v as Nodo[]) : v ? [nodo(v)] : []);

function igualCon(a: number, b: number, tolerancia = TOLERANCIA): boolean {
  return Math.abs(a - b) <= tolerancia;
}

/** Devuelve la lista de cuentas que no cierran (vacía = todo en orden). Cada texto lleva el código de la DNIT. */
export function controlarCalculos(de: Nodo): string[] {
  const problemas: string[] = [];
  const dtip = nodo(de.gDtipDE);
  const items = lista(dtip.gCamItem);
  const sub = nodo(de.gTotSub);
  const porcentajeGlobal = num(sub.dPorcDescTotal);

  let sumaSub5 = 0;
  let sumaSub10 = 0;
  let sumaSubExe = 0;
  let sumaSubExo = 0;
  let sumaDescParticular = 0;
  let sumaDescGlobal = 0;
  let sumaAnticipoItem = 0;
  let sumaAnticipoGlobal = 0;
  let sumaLiq5 = 0;
  let sumaLiq10 = 0;
  let sumaBase5 = 0;
  let sumaBase10 = 0;

  items.forEach((item, i) => {
    const donde = `Línea ${i + 1}`;
    const valor = nodo(item.gValorItem);
    const resta = nodo(valor.gValorRestaItem);
    const iva = nodo(item.gCamIVA);
    const precio = num(valor.dPUniProSer);
    const cantidad = num(item.dCantProSer);

    if (!igualCon(num(valor.dTotBruOpeItem), precio * cantidad)) {
      problemas.push(`${donde}: el total bruto (${num(valor.dTotBruOpeItem)}) no es precio × cantidad (${precio * cantidad}) [E727, código 1859]`);
    }

    const descParticular = num(resta.dDescItem);
    const descGlobal = num(resta.dDescGloItem);
    const anticipoItem = num(resta.dAntPreUniIt);
    const anticipoGlobal = num(resta.dAntGloPreUniIt);
    const total = num(resta.dTotOpeItem);
    const esperado = (precio - descParticular - descGlobal - anticipoItem - anticipoGlobal) * cantidad;
    if (!igualCon(total, esperado)) {
      problemas.push(`${donde}: el total del ítem (${total}) no es (precio − descuentos − anticipos) × cantidad (${esperado}) [EA008, código 1853]`);
    }
    if (precio > 0 && descGlobal > 0 && !igualCon((descGlobal * 100) / precio, porcentajeGlobal, TOLERANCIA_PORCENTAJE)) {
      problemas.push(
        `${donde}: el descuento global del ítem (${((descGlobal * 100) / precio).toFixed(4)} %) no coincide con el porcentaje global de la operación (${porcentajeGlobal} %) [EA004, código 1862]`
      );
    }
    sumaDescParticular += descParticular * cantidad;
    sumaDescGlobal += descGlobal * cantidad;
    sumaAnticipoItem += anticipoItem * cantidad;
    sumaAnticipoGlobal += anticipoGlobal * cantidad;

    const afectacion = num(iva.iAfecIVA);
    const proporcion = num(iva.dPropIVA);
    const tasa = num(iva.dTasaIVA);
    const base = num(iva.dBasGravIVA);
    const liquidacion = num(iva.dLiqIVAItem);
    if (afectacion === 1 || afectacion === 4) {
      if (afectacion === 1 && proporcion !== 100) problemas.push(`${donde}: un ítem gravado lleva proporción gravada 100 (lleva ${proporcion}) [E733, código 1904]`);
      if (tasa !== 5 && tasa !== 10) problemas.push(`${donde}: la tasa del IVA tiene que ser 5 o 10 (es ${tasa}) [E734, código 1908]`);
      const baseEsperada = (100 * total * proporcion) / (10000 + tasa * proporcion);
      if (!igualCon(base, baseEsperada)) problemas.push(`${donde}: la base gravada (${base}) no es la que sale de la fórmula (${baseEsperada.toFixed(4)}) [E735, código 1910/1911]`);
      if (!igualCon(liquidacion, (base * tasa) / 100)) problemas.push(`${donde}: la liquidación del IVA (${liquidacion}) no es base × tasa (${(base * tasa) / 100}) [E736, código 1913]`);
      if (afectacion === 1 && num(iva.dBasExe) !== 0) problemas.push(`${donde}: la base exenta de un ítem gravado tiene que ser 0 [E737, código 1921]`);
    } else {
      if (tasa !== 0 || base !== 0 || liquidacion !== 0 || proporcion !== 0) {
        problemas.push(`${donde}: un ítem exento o exonerado lleva tasa, base, liquidación y proporción en 0 [E733 a E736, códigos 1905 a 1912]`);
      }
    }

    if (afectacion === 1 && tasa === 5) sumaSub5 += total;
    else if (afectacion === 1 && tasa === 10) sumaSub10 += total;
    else if (afectacion === 3) sumaSubExe += total;
    else if (afectacion === 2) sumaSubExo += total;
    if (tasa === 5) {
      sumaLiq5 += liquidacion;
      sumaBase5 += base;
    } else if (tasa === 10) {
      sumaLiq10 += liquidacion;
      sumaBase10 += base;
    }
  });

  const comprobar = (campo: string, id: string, codigo: number, informado: Valor, esperado: number) => {
    if (informado === undefined) return;
    if (!igualCon(num(informado), esperado)) {
      problemas.push(`${campo}: informa ${num(informado)} y debería ser ${esperado} [${id}, código ${codigo}]`);
    }
  };
  comprobar("dSubExe", "F002", 2353, sub.dSubExe, sumaSubExe);
  comprobar("dSubExo", "F003", 2355, sub.dSubExo, sumaSubExo);
  comprobar("dSub5", "F004", 2357, sub.dSub5, sumaSub5);
  comprobar("dSub10", "F005", 2359, sub.dSub10, sumaSub10);
  const totalBruto = sumaSubExe + sumaSubExo + sumaSub5 + sumaSub10;
  comprobar("dTotOpe", "F008", 2362, sub.dTotOpe, totalBruto);
  comprobar("dTotDesc", "F009", 2363, sub.dTotDesc, sumaDescParticular);
  comprobar("dTotDescGlotem", "F033", 2383, sub.dTotDescGlotem, sumaDescGlobal);
  comprobar("dTotAntItem", "F034", 2384, sub.dTotAntItem, sumaAnticipoItem);
  comprobar("dTotAnt", "F035", 2384, sub.dTotAnt, sumaAnticipoGlobal);
  comprobar("dDescTotal", "F011", 2364, sub.dDescTotal, sumaDescParticular + sumaDescGlobal);
  comprobar("dAnticipo", "F012", 2364, sub.dAnticipo, sumaAnticipoItem + sumaAnticipoGlobal);
  comprobar("dTotGralOpe", "F014", 2365, sub.dTotGralOpe, totalBruto - num(sub.dRedon) + num(sub.dComi));
  comprobar("dLiqTotIVA5", "F015", 2367, sub.dLiqTotIVA5, sumaLiq5);
  comprobar("dLiqTotIVA10", "F016", 2369, sub.dLiqTotIVA10, sumaLiq10);
  comprobar("dTotIVA", "F017", 2371, sub.dTotIVA, sumaLiq5 + sumaLiq10 - num(sub.dIVA5) - num(sub.dIVA10) + num(sub.dIVAComi));
  comprobar("dBaseGrav5", "F018", 2373, sub.dBaseGrav5, sumaBase5);
  comprobar("dBaseGrav10", "F019", 2375, sub.dBaseGrav10, sumaBase10);
  comprobar("dTBasGraIVA", "F020", 2377, sub.dTBasGraIVA, sumaBase5 + sumaBase10);

  return problemas;
}
