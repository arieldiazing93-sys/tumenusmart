/**
 * Arma, a partir de un Comprobante, el Documento Electrónico (DE) de SIFEN en
 * JSON — con los nombres de campo del esquema oficial de la DNIT (DE_v150.xsd)
 * — y dice qué datos todavía faltan para poder emitirlo.
 *
 * Es la FOTO de lo que un proveedor de factura electrónica va a necesitar:
 * cada proveedor tiene su propio formato de envío, pero todos parten de estos
 * mismos datos y de estas mismas cuentas. Acá no se firma ni se envía nada:
 * es el armado y el control de lo que falta.
 *
 * Las fórmulas están tomadas del Manual Técnico v150 (DNIT):
 *  - Total por ítem (dTotOpeItem) = (precio − descuentos) × cantidad, con el
 *    IVA incluido en el precio.
 *  - Base gravada (dBasGravIVA) = total ÷ 1,1 (tasa 10%) o ÷ 1,05 (tasa 5%);
 *    liquidación (dLiqIVAItem) = base × tasa. Exento: base y liquidación en 0.
 *  - Subtotales por tasa = suma de los totales por ítem; total de la operación
 *    = suma de los subtotales.
 *
 * Sin Prisma: se puede probar sin levantar una base.
 */

import { emisorDesdeFila, faltantesEmisor, DEPARTAMENTOS } from "./emisor-fiscal";
import {
  CONDICION_SIFEN,
  PRESENCIA_SIFEN,
  TIPO_DOCUMENTO_SIFEN,
  TIPO_EMISION_SIFEN,
  TIPO_IMPUESTO_IVA,
  TIPO_TRANSACCION_SIFEN,
  calcularDvRuc,
  codigoTipoPago,
  codigoUnidadMedida,
  ivaSifen,
  receptorSifen,
  separarRuc,
  tipoContribuyenteDeRuc,
} from "./sifen-codigos";
import { ZONA_NEGOCIO, claveDiaAsuncion } from "./timezone";

export type ItemParaDocumento = {
  codigo: string | null;
  descripcion: string;
  unidadMedida: string;
  cantidad: number;
  /** De lista, IVA incluido. */
  precioUnitario: number;
  /** El descuento general repartido a esta línea (total de la línea, no por unidad). */
  descuento: number;
  /** cantidad × precio − descuento. */
  total: number;
  iva: string;
};

export type ComprobanteParaDocumento = {
  tipo: string;
  modalidad: string;
  tipoEmision: string;
  timbrado: string;
  timbradoDesde: Date | null;
  establecimiento: string;
  punto: string;
  correlativo: number;
  numero: string;
  fechaEmision: Date;
  tipoTransaccion: string;
  moneda: string;
  emisorRuc: string;
  emisorRazonSocial: string;
  /** La copia de EmisorFiscal guardada en el comprobante (JSON), o null. */
  emisorDatos: unknown;
  receptorTipoIdentificacion: string;
  receptorNumeroIdentificacion: string;
  receptorRazonSocial: string | null;
  receptorEmail: string | null;
  presencia: string;
  condicion: string;
  fechaVencimientoCredito: Date | null;
  total: number;
  items: ItemParaDocumento[];
};

export type PagoParaDocumento = { forma: string; monto: number };

export type ResultadoDocumento = {
  /** El DE en JSON, con los nombres de campo de SIFEN. */
  documento: Record<string, unknown>;
  /** Lo que hay que completar antes de poder emitir (bloquea). */
  faltantes: string[];
  /** Cosas a tener en cuenta que no frenan (estimaciones, diferencias de formato…). */
  avisos: string[];
};

/** Guaraníes enteros: SIFEN trabaja los montos en PYG sin decimales. */
function gs(n: number): number {
  return Math.round(n);
}

/** Saca las claves sin valor (null / undefined / vacío) para que el JSON quede limpio. */
function sinNulos<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const salida: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined || v === "") continue;
    salida[k] = v;
  }
  return salida;
}

/** "2026-09-27T14:30:05", en hora de Asunción (dFeEmiDE). */
function fechaHoraIso(fecha: Date): string {
  return fecha.toLocaleString("sv-SE", { timeZone: ZONA_NEGOCIO }).replace(" ", "T");
}

/** Días de plazo de un crédito, contando del día de la emisión al del vencimiento. */
function plazoEnDias(emision: Date, vencimiento: Date): number {
  const desde = Date.parse(claveDiaAsuncion(emision));
  return Math.max(1, Math.round((vencimiento.getTime() - desde) / (24 * 60 * 60 * 1000)));
}

const LIMITE_INNOMINADO = 60_000_000;

export function armarDocumentoElectronico(
  c: ComprobanteParaDocumento,
  pagos: PagoParaDocumento[]
): ResultadoDocumento {
  const faltantes: string[] = [];
  const avisos: string[] = [];

  if (c.modalidad !== "electronico") {
    avisos.push(
      "Este comprobante se emitió como factura autoimpresor. La factura electrónica lleva otro timbrado (con su propia numeración): esto es una vista previa de cómo saldría con los mismos datos."
    );
  }
  if (c.timbrado.replace(/\D/g, "").length !== 8) {
    avisos.push(`El número de timbrado tiene ${c.timbrado.length} caracteres; SIFEN pide 8 dígitos.`);
  }

  // ---------------------------------------------------------------- emisor
  const emisor = emisorDesdeFila(c.emisorDatos as Record<string, unknown> | null);
  faltantes.push(...faltantesEmisor(emisor));

  const rucEmisor = separarRuc(c.emisorRuc);
  if (!rucEmisor.dv) {
    faltantes.push("El RUC del emisor no tiene el dígito verificador (formato 80012345-6)");
  } else if (Number(rucEmisor.dv) !== calcularDvRuc(rucEmisor.numero)) {
    avisos.push(
      `El dígito verificador del RUC del emisor (${rucEmisor.dv}) no coincide con el que da el algoritmo módulo 11 (${calcularDvRuc(rucEmisor.numero)}). Revisalo.`
    );
  }

  const departamento = DEPARTAMENTOS.find((d) => d.clave === emisor.departamento);
  const tipoContEmisor = emisor.tipoContribuyente === "persona_juridica" ? 2 : emisor.tipoContribuyente === "persona_fisica" ? 1 : null;

  const gEmis = sinNulos({
    dRucEm: rucEmisor.numero,
    dDVEmi: rucEmisor.dv,
    iTipCont: tipoContEmisor,
    cTipReg: emisor.tipoRegimen,
    dNomEmi: c.emisorRazonSocial,
    dNomFanEmi: emisor.nombreFantasia,
    dDirEmi: emisor.direccion,
    dNumCas: emisor.numeroCasa,
    dCompDir1: emisor.complemento,
    cDepEmi: departamento?.codigoSifen,
    dDesDepEmi: departamento?.descripcionSifen,
    cDisEmi: emisor.distritoCodigo,
    dDesDisEmi: emisor.distrito,
    cCiuEmi: emisor.ciudadCodigo,
    dDesCiuEmi: emisor.ciudad,
    dTelEmi: emisor.telefono,
    dEmailE: emisor.email,
    dDenSuc: emisor.denominacionSucursal,
    gActEco: emisor.actividades.map((a) => ({ cActEco: a.codigo, dDesActEco: a.descripcion })),
  });

  // ------------------------------------------------------------- receptor
  const rec = receptorSifen(c.receptorTipoIdentificacion);
  const esInnominado = c.receptorTipoIdentificacion === "sin_nombre";
  const esContribuyente = rec.naturaleza === 1;

  if (esInnominado && c.total >= LIMITE_INNOMINADO) {
    faltantes.push('No se puede facturar a "Sin Nombre" por 60.000.000 Gs. o más: hay que identificar al comprador.');
  }
  if (!esInnominado && (c.receptorRazonSocial ?? "").trim().length < 4) {
    faltantes.push("La razón social del comprador tiene que tener al menos 4 caracteres");
  }

  let gDatRec: Record<string, unknown>;
  if (esContribuyente) {
    const rucRec = separarRuc(c.receptorNumeroIdentificacion);
    if (!rucRec.dv) {
      faltantes.push("El RUC del comprador no tiene el dígito verificador (formato 80012345-6)");
    } else if (Number(rucRec.dv) !== calcularDvRuc(rucRec.numero)) {
      avisos.push(
        `El dígito verificador del RUC del comprador (${rucRec.dv}) no coincide con el que da el algoritmo módulo 11 (${calcularDvRuc(rucRec.numero)}). Revisalo.`
      );
    }
    avisos.push(
      "El tipo de contribuyente del comprador (persona física o jurídica) se estimó por el número de RUC: todavía no se guarda en la ficha del cliente."
    );
    gDatRec = sinNulos({
      iNatRec: 1,
      iTiOpe: 1,
      cPaisRec: "PRY",
      dDesPaisRe: "Paraguay",
      iTiContRec: tipoContribuyenteDeRuc(rucRec.numero),
      dRucRec: rucRec.numero,
      dDVRec: rucRec.dv,
      dNomRec: c.receptorRazonSocial,
      dEmailRec: c.receptorEmail,
    });
  } else {
    gDatRec = sinNulos({
      iNatRec: 2,
      iTiOpe: 2,
      cPaisRec: "PRY",
      dDesPaisRe: "Paraguay",
      iTipIDRec: rec.tipoDocumento,
      dNumIDRec: esInnominado ? "0" : c.receptorNumeroIdentificacion,
      dNomRec: esInnominado ? "Sin Nombre" : c.receptorRazonSocial,
      dEmailRec: esInnominado ? null : c.receptorEmail,
    });
  }

  // ---------------------------------------------------------------- ítems
  let sinCodigo = 0;
  const filas = c.items.map((it) => {
    const { afectacion, tasa } = ivaSifen(it.iva);
    const totalItem = gs(it.total);
    const base = afectacion === 1 ? (tasa === 10 ? totalItem / 1.1 : totalItem / 1.05) : 0;
    const baseGs = gs(base);
    const liquidacion = afectacion === 1 ? gs((baseGs * tasa) / 100) : 0;
    const descPorUnidad = it.cantidad > 0 ? Math.round((it.descuento / it.cantidad) * 100) / 100 : 0;
    if (!it.codigo) sinCodigo += 1;
    return { it, afectacion, tasa, totalItem, baseGs, liquidacion, descPorUnidad };
  });
  if (sinCodigo > 0) {
    avisos.push(
      `${sinCodigo} línea(s) sin código de producto (combo mitad y mitad o costo de envío): se les pone el código "S/C".`
    );
  }

  const gCamItem = filas.map((f) => ({
    dCodInt: f.it.codigo ?? "S/C",
    dDesProSer: f.it.descripcion,
    cUniMed: codigoUnidadMedida(f.it.unidadMedida),
    dCantProSer: f.it.cantidad,
    gValorItem: {
      dPUniProSer: gs(f.it.precioUnitario),
      dTotBruOpeItem: gs(f.it.precioUnitario * f.it.cantidad),
      gValorRestaItem: {
        dDescItem: 0,
        dDescGloItem: f.descPorUnidad,
        dTotOpeItem: f.totalItem,
      },
    },
    gCamIVA: {
      iAfecIVA: f.afectacion,
      dPropIVA: f.afectacion === 1 ? 100 : 0,
      dTasaIVA: f.tasa,
      dBasGravIVA: f.baseGs,
      dLiqIVAItem: f.liquidacion,
    },
  }));

  // -------------------------------------------------------------- totales
  const suma = (fn: (f: (typeof filas)[number]) => number) => filas.reduce((s, f) => s + fn(f), 0);
  const dSub10 = suma((f) => (f.afectacion === 1 && f.tasa === 10 ? f.totalItem : 0));
  const dSub5 = suma((f) => (f.afectacion === 1 && f.tasa === 5 ? f.totalItem : 0));
  const dSubExe = suma((f) => (f.afectacion === 3 ? f.totalItem : 0));
  const dTotOpe = dSub10 + dSub5 + dSubExe;
  const dLiqTotIVA10 = suma((f) => (f.tasa === 10 ? f.liquidacion : 0));
  const dLiqTotIVA5 = suma((f) => (f.tasa === 5 ? f.liquidacion : 0));
  const dBaseGrav10 = suma((f) => (f.tasa === 10 ? f.baseGs : 0));
  const dBaseGrav5 = suma((f) => (f.tasa === 5 ? f.baseGs : 0));
  const descuentoTotal = suma((f) => f.it.descuento);
  const brutoAntesDeDescuento = dTotOpe + gs(descuentoTotal);

  const gTotSub = {
    dSubExe,
    dSubExo: 0,
    dSub5,
    dSub10,
    dTotOpe,
    dTotDesc: 0,
    dTotDescGlotem: gs(descuentoTotal),
    dTotAntItem: 0,
    dTotAnt: 0,
    dPorcDescTotal: brutoAntesDeDescuento > 0 ? Math.round((descuentoTotal / brutoAntesDeDescuento) * 10000) / 100 : 0,
    dDescTotal: gs(descuentoTotal),
    dAnticipo: 0,
    dRedon: 0,
    dComi: 0,
    dTotGralOpe: dTotOpe,
    dLiqTotIVA5,
    dLiqTotIVA10,
    dTotIVA: dLiqTotIVA5 + dLiqTotIVA10,
    dBaseGrav5,
    dBaseGrav10,
    dTBasGraIVA: dBaseGrav5 + dBaseGrav10,
  };

  if (Math.abs(dTotOpe - gs(c.total)) > 1) {
    avisos.push(
      `La suma de las líneas (${dTotOpe}) no coincide con el total del comprobante (${gs(c.total)}). Revisá los montos antes de emitir.`
    );
  }

  // ------------------------------------------------- condición y forma de pago
  let gCamCond: Record<string, unknown>;
  if (c.condicion === "credito") {
    gCamCond = {
      iCondOpe: CONDICION_SIFEN.credito,
      gPagCred: {
        iCondCred: 1,
        dPlazoCre: `${c.fechaVencimientoCredito ? plazoEnDias(c.fechaEmision, c.fechaVencimientoCredito) : 30} días`,
      },
    };
  } else {
    if (pagos.length === 0) {
      avisos.push("No hay una forma de pago registrada para esta cuenta: el documento no lleva el detalle de pagos.");
    } else {
      const sumaPagos = pagos.reduce((s, p) => s + p.monto, 0);
      if (Math.abs(sumaPagos - c.total) > 1) {
        avisos.push(`Los pagos suman ${gs(sumaPagos)} y el comprobante es de ${gs(c.total)}.`);
      }
    }
    gCamCond = {
      iCondOpe: CONDICION_SIFEN.contado,
      gPaConEIni: pagos.map((p) => ({
        iTiPago: codigoTipoPago(p.forma),
        dMonTiPag: gs(p.monto),
        cMoneTiPag: c.moneda,
      })),
    };
  }

  const tipoDoc = (TIPO_DOCUMENTO_SIFEN as Record<string, number>)[c.tipo] ?? 1;
  const documento = {
    iTipEmi: (TIPO_EMISION_SIFEN as Record<string, number>)[c.tipoEmision] ?? 1,
    gDatGralOpe: {
      dFeEmiDE: fechaHoraIso(c.fechaEmision),
      gOpeCom: {
        iTipTra: (TIPO_TRANSACCION_SIFEN as Record<string, number>)[c.tipoTransaccion] ?? 1,
        iTImp: TIPO_IMPUESTO_IVA,
        cMoneOpe: c.moneda,
      },
      gEmis,
      gDatRec,
    },
    gTimb: sinNulos({
      iTiDE: tipoDoc,
      dNumTim: c.timbrado,
      dEst: c.establecimiento,
      dPunExp: c.punto,
      dNumDoc: String(c.correlativo).padStart(7, "0"),
      dFeIniT: c.timbradoDesde ? claveDiaAsuncion(c.timbradoDesde) : null,
    }),
    gDtipDE: {
      gCamFE: { iIndPres: (PRESENCIA_SIFEN as Record<string, number>)[c.presencia] ?? 1 },
      gCamCond,
      gCamItem,
    },
    gTotSub,
  };

  if (!c.timbradoDesde) {
    avisos.push("Falta la fecha de inicio de vigencia del timbrado (dFeIniT).");
  }

  return { documento, faltantes, avisos };
}
