/**
 * Armado del Documento Electrónico (DE) de SIFEN: la factura electrónica completa, lista para firmar.
 *
 * A partir de un Comprobante (la foto de lo que se facturó) arma el árbol del documento con los nombres y el
 * detalle que pide el esquema oficial de la DNIT, calcula el CDC y controla el resultado contra ese esquema.
 *
 * Todas las reglas salen de la documentación oficial: Manual Técnico v150 más sus notas técnicas (NT 1 a 27),
 * https://www.dnit.gov.py/web/e-kuatia/documentacion-tecnica. Las que más cuentan:
 *  - NT 1 / NT 13: fórmulas del descuento global, de la base gravada y de la liquidación del IVA por ítem.
 *  - NT 12: total general = total bruto − redondeo + comisión.
 *  - NT 23 / NT 24: sin nombre (innominado) NO se permite desde 7.000.000 Gs. (Decreto 872/2023), y el comprador
 *    que no es contribuyente lleva siempre tipo y número de documento ("0" si es innominado).
 *  - Sección 12: la DNIT acepta ±0,50 Gs. de diferencia en los cálculos; acá todo va en guaraníes enteros.
 *
 * Este módulo no firma ni envía nada, y no usa Prisma: se puede probar sin base de datos.
 */

import type { ComprobanteParaDocumento, PagoParaDocumento } from "../documento-electronico";
import { DEPARTAMENTOS, emisorDesdeFila, faltantesEmisor } from "../emisor-fiscal";
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
} from "../sifen-codigos";
import { ZONA_NEGOCIO, claveDiaAsuncion } from "../timezone";
import { construirCdc, generarCodigoSeguridad } from "./cdc";
import { controlarCalculos } from "./controlar";
import { validarContraEsquema, validarSimple, type Nodo } from "./xml";

// ---------------------------------------------------------------------------
//  Constantes y descripciones (el texto de cada código, tal cual lo define el esquema)
// ---------------------------------------------------------------------------

/**
 * Texto que va como nombre del emisor y como descripción del PRIMER ítem en el ambiente de PRUEBAS, y que está
 * prohibido en producción. Es el de la Guía de Pruebas de la DNIT (actualizada en febrero de 2026). El Manual Técnico
 * de 2019 (regla D105) menciona otro: "DE generado en ambiente de prueba - sin valor comercial ni fiscal".
 * Hay dos redacciones oficiales: la correcta se confirma contra el ambiente de pruebas real (si lo rechaza, se
 * cambia solo esta constante).
 */
export const NOMBRE_EMISOR_PRUEBAS = "DOCUMENTO ELECTRÓNICO SIN VALOR COMERCIAL NI FISCAL - GENERADO EN AMBIENTE DE PRUEBA";
/** La redacción del Manual Técnico v150 (D105): en producción tampoco puede aparecer. */
const NOMBRE_EMISOR_PRUEBAS_MANUAL = "DE generado en ambiente de prueba - sin valor comercial ni fiscal";

/** Desde este total (en guaraníes) no se puede facturar a "Sin Nombre": hay que identificar al comprador (NT 24). */
export const LIMITE_INNOMINADO = 7_000_000;

export const DESCRIPCION_TIPO_DOCUMENTO: Record<number, string> = {
  1: "Factura electrónica",
  4: "Autofactura electrónica",
  5: "Nota de crédito electrónica",
  6: "Nota de débito electrónica",
  7: "Nota de remisión electrónica",
};
export const DESCRIPCION_TIPO_EMISION: Record<number, string> = { 1: "Normal", 2: "Contingencia" };
export const DESCRIPCION_TIPO_TRANSACCION: Record<number, string> = {
  1: "Venta de mercadería",
  2: "Prestación de servicios",
  3: "Mixto (Venta de mercadería y servicios)",
};
export const DESCRIPCION_PRESENCIA: Record<number, string> = {
  1: "Operación presencial",
  2: "Operación electrónica",
  3: "Operación telemarketing",
  4: "Venta a domicilio",
  5: "Operación bancaria",
  6: "Operación cíclica",
  9: "Otro",
};
export const DESCRIPCION_TIPO_PAGO: Record<number, string> = {
  1: "Efectivo",
  3: "Tarjeta de crédito",
  4: "Tarjeta de débito",
  5: "Transferencia",
  99: "Otro",
};
export const DESCRIPCION_DOCUMENTO_RECEPTOR: Record<number, string> = {
  1: "Cédula paraguaya",
  2: "Pasaporte",
  3: "Cédula extranjera",
  4: "Carnet de residencia",
  5: "Innominado",
  6: "Tarjeta Diplomática de exoneración fiscal",
  9: "Otro",
};
export const DESCRIPCION_UNIDAD_MEDIDA: Record<number, string> = { 77: "UNI", 83: "kg", 89: "LT" };
export const DESCRIPCION_AFECTACION_IVA: Record<number, string> = { 1: "Gravado IVA", 3: "Exento" };

// ---------------------------------------------------------------------------
//  Tipos
// ---------------------------------------------------------------------------

export type OpcionesDE = {
  /** Cuándo se firma el documento (dFecFirma). No puede ser posterior al momento del envío. */
  fechaFirma: Date;
  /** dCodSeg: 9 dígitos. Si no se pasa, se genera uno al azar (lo normal). Fijarlo solo sirve para pruebas. */
  codigoSeguridad?: string;
  /** En "pruebas" el nombre del emisor lleva el texto que exige la DNIT; en "produccion" no puede llevarlo. */
  ambiente: "pruebas" | "produccion";
};

export type ResultadoDE = {
  /** El árbol <DE Id="…"> sin firma. Es null si no se pudo ni armar el CDC. */
  de: Nodo | null;
  cdc: string | null;
  /** Lo que hay que corregir o completar antes de poder emitir (si hay algo, el documento NO se puede enviar). */
  faltantes: string[];
  /** Cosas a tener en cuenta que no frenan. */
  avisos: string[];
};

// ---------------------------------------------------------------------------
//  Utilidades
// ---------------------------------------------------------------------------

const gs = (n: number): number => Math.round(n);

/** Hasta 8 decimales (el máximo que admite el esquema) sin arrastrar ruido de coma flotante. */
function redondear8(n: number): number {
  return Math.round((n + Number.EPSILON) * 1e8) / 1e8;
}

/** "2026-09-27T14:30:05" en hora de Asunción (formato de dFeEmiDE y dFecFirma). */
export function fechaHoraIso(fecha: Date): string {
  return fecha.toLocaleString("sv-SE", { timeZone: ZONA_NEGOCIO }).replace(" ", "T");
}

function plazoEnDias(emision: Date, vencimiento: Date): number {
  const desde = Date.parse(claveDiaAsuncion(emision));
  return Math.max(1, Math.round((vencimiento.getTime() - desde) / (24 * 60 * 60 * 1000)));
}

/** Código interno de un ítem. Los que no son un producto único (mitad y mitad, envío) reciben uno propio y estable. */
function codigoInterno(codigo: string | null, descripcion: string): string {
  if (codigo && codigo.trim() !== "") return codigo.trim().slice(0, 50);
  if (/^env[ií]o/i.test(descripcion.trim())) return "ENVIO";
  // Un código que sale de la descripción: la misma línea siempre lleva el mismo código y dos distintas no lo comparten.
  let h = 5381;
  for (const ch of descripcion) h = ((h * 33) ^ ch.codePointAt(0)!) >>> 0;
  return "S" + h.toString(36).toUpperCase();
}

function limpiarDocumento(valor: string): string {
  return valor.replace(/[.\s]/g, "");
}

// ---------------------------------------------------------------------------
//  El documento
// ---------------------------------------------------------------------------

export function armarDE(c: ComprobanteParaDocumento, pagos: PagoParaDocumento[], op: OpcionesDE): ResultadoDE {
  const faltantes: string[] = [];
  const avisos: string[] = [];

  // --------------------------------------------------------------- tipo de documento
  const tipoDocumento = (TIPO_DOCUMENTO_SIFEN as Record<string, number>)[c.tipo] ?? 1;
  if (tipoDocumento !== 1) {
    faltantes.push(
      `Por ahora solo se arma la factura electrónica: el tipo "${c.tipo}" (${DESCRIPCION_TIPO_DOCUMENTO[tipoDocumento] ?? "otro"}) queda para la próxima etapa.`
    );
  }
  if (c.modalidad !== "electronico") {
    avisos.push(
      "Este comprobante se emitió como factura autoimpresor. La electrónica lleva otro timbrado (con su propia numeración): esto es una vista previa con los mismos datos."
    );
  }

  // ---------------------------------------------------------------------- timbrado
  const timbrado = c.timbrado.trim();
  if (!/^\d{8}$/.test(timbrado) || /^0+$/.test(timbrado)) {
    faltantes.push(`El número de timbrado electrónico tiene que tener 8 dígitos (tiene "${timbrado}")`);
  }
  if (!/^\d{3}$/.test(c.establecimiento)) faltantes.push(`El establecimiento tiene que tener 3 dígitos (tiene "${c.establecimiento}")`);
  if (!/^\d{3}$/.test(c.punto)) faltantes.push(`El punto de expedición tiene que tener 3 dígitos (tiene "${c.punto}")`);
  if (!Number.isInteger(c.correlativo) || c.correlativo < 1 || c.correlativo > 9_999_999) {
    faltantes.push(`El número de documento tiene que estar entre 1 y 9999999 (es ${c.correlativo})`);
  }
  let fechaInicioTimbrado: string | null = null;
  if (!c.timbradoDesde) {
    faltantes.push("Falta la fecha de inicio de vigencia del timbrado");
  } else {
    fechaInicioTimbrado = claveDiaAsuncion(c.timbradoDesde);
    if (fechaInicioTimbrado < "2018-05-01") faltantes.push("La fecha de inicio del timbrado no puede ser anterior al 2018-05-01");
  }

  // ------------------------------------------------------------------------ emisor
  const emisor = emisorDesdeFila(c.emisorDatos as Record<string, unknown> | null);
  const faltanEmisor = faltantesEmisor(emisor);
  faltantes.push(...faltanEmisor);

  const rucEmisor = separarRuc(c.emisorRuc);
  if (!/^[1-9]\d{2,7}$/.test(rucEmisor.numero)) {
    faltantes.push(`El RUC del emisor tiene que tener entre 3 y 8 dígitos, sin ceros adelante (tiene "${rucEmisor.numero}")`);
  } else if (!rucEmisor.dv) {
    faltantes.push("El RUC del emisor no tiene el dígito verificador (formato 80012345-6)");
  } else if (Number(rucEmisor.dv) !== calcularDvRuc(rucEmisor.numero)) {
    faltantes.push(
      `El dígito verificador del RUC del emisor (${rucEmisor.dv}) no coincide con el que da el módulo 11 (${calcularDvRuc(rucEmisor.numero)}): la DNIT lo rechaza`
    );
  }

  const nombreEmisor = op.ambiente === "pruebas" ? NOMBRE_EMISOR_PRUEBAS : c.emisorRazonSocial.trim();
  const nombreDeclarado = c.emisorRazonSocial.trim().toLowerCase();
  if (op.ambiente === "produccion" && (nombreDeclarado === NOMBRE_EMISOR_PRUEBAS.toLowerCase() || nombreDeclarado === NOMBRE_EMISOR_PRUEBAS_MANUAL.toLowerCase())) {
    faltantes.push("El nombre del emisor no puede ser el texto del ambiente de pruebas cuando se emite en producción");
  }
  if (nombreEmisor.length < 4) faltantes.push("La razón social del emisor tiene que tener al menos 4 caracteres");

  const departamento = DEPARTAMENTOS.find((d) => d.clave === emisor.departamento);
  const tipoContEmisor = emisor.tipoContribuyente === "persona_juridica" ? 2 : emisor.tipoContribuyente === "persona_fisica" ? 1 : null;
  if (emisor.email) {
    const m = validarSimple("tEmail", emisor.email);
    if (m !== null) faltantes.push(`El correo del emisor "${emisor.email}" no tiene un formato que acepte la DNIT`);
  }

  const gEmis: Nodo = {
    dRucEm: rucEmisor.numero,
    dDVEmi: rucEmisor.dv,
    iTipCont: tipoContEmisor ?? undefined,
    cTipReg: emisor.tipoRegimen ?? undefined,
    dNomEmi: nombreEmisor,
    dNomFanEmi: emisor.nombreFantasia ?? undefined,
    dDirEmi: emisor.direccion ?? undefined,
    dNumCas: emisor.numeroCasa ?? undefined,
    dCompDir1: emisor.complemento ?? undefined,
    cDepEmi: departamento?.codigoSifen,
    dDesDepEmi: departamento?.descripcionSifen,
    cDisEmi: emisor.distritoCodigo ?? undefined,
    dDesDisEmi: emisor.distrito ?? undefined,
    cCiuEmi: emisor.ciudadCodigo ?? undefined,
    dDesCiuEmi: emisor.ciudad ?? undefined,
    dTelEmi: emisor.telefono ?? undefined,
    dEmailE: emisor.email ?? undefined,
    dDenSuc: emisor.denominacionSucursal ?? undefined,
    gActEco: emisor.actividades.map((a) => ({ cActEco: a.codigo, dDesActEco: a.descripcion })),
  };

  // ---------------------------------------------------------------------- ítems
  let sinCodigo = 0;
  const filas = c.items.map((it, i) => {
    const { afectacion, tasa } = ivaSifen(it.iva);
    const total = gs(it.total);
    const bruto = redondear8(it.precioUnitario * it.cantidad);
    // El descuento de la línea sale de la diferencia entre lo bruto y lo cobrado: así la cuenta de la DNIT
    // (precio − descuento) × cantidad = total cierra siempre.
    const descuentoLinea = redondear8(bruto - total);
    if (descuentoLinea < -0.5) {
      faltantes.push(`La línea ${i + 1} ("${it.descripcion}") cobra más (${total}) que precio × cantidad (${bruto})`);
    }
    if (Math.abs(it.descuento - descuentoLinea) > 0.5) {
      avisos.push(`La línea ${i + 1}: el descuento guardado (${it.descuento}) difiere del que sale de las cuentas (${descuentoLinea}); se usa el segundo.`);
    }
    if (!it.codigo) sinCodigo += 1;
    const descPorUnidad = it.cantidad > 0 ? redondear8(Math.max(descuentoLinea, 0) / it.cantidad) : 0;
    // NT 13: base = 100 × total × proporción / (10000 + tasa × proporción); con 100 % gravado es total ÷ 1,1 (10 %) o ÷ 1,05 (5 %).
    const base = afectacion === 1 ? gs((100 * total * 100) / (10000 + tasa * 100)) : 0;
    const liquidacion = afectacion === 1 ? gs((base * tasa) / 100) : 0;
    return { it, afectacion, tasa, total, bruto, descuentoLinea: Math.max(descuentoLinea, 0), descPorUnidad, base, liquidacion };
  });
  if (sinCodigo > 0) {
    avisos.push(`${sinCodigo} línea(s) no son un producto único (mitad y mitad o envío): se les asigna un código interno propio.`);
  }
  if (filas.length === 0) faltantes.push("El documento no tiene ninguna línea");
  if (filas.length > 999) faltantes.push("El documento tiene más de 999 líneas");

  const gCamItem = filas.map((f, indice) => {
    const unidad = codigoUnidadMedida(f.it.unidadMedida);
    return {
      dCodInt: codigoInterno(f.it.codigo, f.it.descripcion),
      // Guía de Pruebas de la DNIT: en el ambiente de pruebas el primer ítem lleva el texto de "sin valor fiscal".
      dDesProSer: op.ambiente === "pruebas" && indice === 0 ? NOMBRE_EMISOR_PRUEBAS : f.it.descripcion.trim(),
      cUniMed: unidad,
      dDesUniMed: DESCRIPCION_UNIDAD_MEDIDA[unidad] ?? "UNI",
      dCantProSer: f.it.cantidad,
      gValorItem: {
        dPUniProSer: f.it.precioUnitario,
        dTotBruOpeItem: f.bruto,
        gValorRestaItem: {
          dDescItem: 0,
          dPorcDesIt: 0,
          dDescGloItem: f.descPorUnidad,
          dAntPreUniIt: 0,
          dAntGloPreUniIt: 0,
          dTotOpeItem: f.total,
        },
      },
      gCamIVA: {
        iAfecIVA: f.afectacion,
        dDesAfecIVA: DESCRIPCION_AFECTACION_IVA[f.afectacion],
        dPropIVA: f.afectacion === 1 ? 100 : 0,
        dTasaIVA: f.tasa,
        dBasGravIVA: f.base,
        dLiqIVAItem: f.liquidacion,
        dBasExe: 0,
      },
    } as Nodo;
  });

  // --------------------------------------------------------------------- totales
  const suma = (fn: (f: (typeof filas)[number]) => number) => filas.reduce((s, f) => s + fn(f), 0);
  const dSub10 = suma((f) => (f.afectacion === 1 && f.tasa === 10 ? f.total : 0));
  const dSub5 = suma((f) => (f.afectacion === 1 && f.tasa === 5 ? f.total : 0));
  const dSubExe = suma((f) => (f.afectacion === 3 ? f.total : 0));
  const dTotOpe = dSub10 + dSub5 + dSubExe;
  const liq10 = suma((f) => (f.tasa === 10 ? f.liquidacion : 0));
  const liq5 = suma((f) => (f.tasa === 5 ? f.liquidacion : 0));
  const base10 = suma((f) => (f.tasa === 10 ? f.base : 0));
  const base5 = suma((f) => (f.tasa === 5 ? f.base : 0));
  const descuentoTotal = suma((f) => f.descuentoLinea);
  const brutoTotal = suma((f) => f.bruto);

  const gTotSub: Nodo = {
    dSubExe,
    dSubExo: 0,
    dSub5,
    dSub10,
    dTotOpe,
    dTotDesc: 0,
    dTotDescGlotem: redondear8(descuentoTotal),
    dTotAntItem: 0,
    dTotAnt: 0,
    dPorcDescTotal: brutoTotal > 0 ? redondear8((descuentoTotal / brutoTotal) * 100) : 0,
    dDescTotal: redondear8(descuentoTotal),
    dAnticipo: 0,
    dRedon: 0,
    // NT 12: total general = total bruto − redondeo + comisión (sin redondeo ni comisión, el mismo total bruto).
    dTotGralOpe: dTotOpe,
    dLiqTotIVA5: liq5,
    dLiqTotIVA10: liq10,
    dTotIVA: liq5 + liq10,
    dBaseGrav5: base5,
    dBaseGrav10: base10,
    dTBasGraIVA: base5 + base10,
  };
  if (Math.abs(dTotOpe - gs(c.total)) > 1) {
    faltantes.push(`La suma de las líneas (${dTotOpe}) no coincide con el total del comprobante (${gs(c.total)})`);
  }

  // -------------------------------------------------------------------- receptor
  const rec = receptorSifen(c.receptorTipoIdentificacion);
  const esInnominado = c.receptorTipoIdentificacion === "sin_nombre";
  const esContribuyente = rec.naturaleza === 1;
  if (esInnominado && dTotOpe >= LIMITE_INNOMINADO) {
    faltantes.push(`No se puede facturar a "Sin Nombre" desde ${LIMITE_INNOMINADO.toLocaleString("es-PY")} Gs.: hay que identificar al comprador (Decreto 872/2023).`);
  }
  const nombreReceptor = (c.receptorRazonSocial ?? "").trim();
  if (!esInnominado && nombreReceptor.length < 4) faltantes.push("La razón social o el nombre del comprador tiene que tener al menos 4 caracteres");

  let emailReceptor: string | undefined;
  if (c.receptorEmail && !esInnominado) {
    if (validarSimple("tEmail", c.receptorEmail) === null) emailReceptor = c.receptorEmail;
    else avisos.push(`El correo del comprador "${c.receptorEmail}" no tiene un formato que acepte la DNIT: se omite del documento.`);
  }

  let gDatRec: Nodo;
  let idReceptor: string;
  if (esContribuyente) {
    const rucRec = separarRuc(c.receptorNumeroIdentificacion);
    if (!/^[1-9]\d{2,7}$/.test(rucRec.numero)) {
      faltantes.push(`El RUC del comprador tiene que tener entre 3 y 8 dígitos (tiene "${rucRec.numero}")`);
    } else if (!rucRec.dv) {
      faltantes.push("El RUC del comprador no tiene el dígito verificador (formato 80012345-6)");
    } else if (Number(rucRec.dv) !== calcularDvRuc(rucRec.numero)) {
      faltantes.push(`El dígito verificador del RUC del comprador (${rucRec.dv}) no coincide con el que da el módulo 11 (${calcularDvRuc(rucRec.numero)})`);
    }
    avisos.push("El tipo de contribuyente del comprador (persona física o jurídica) se estimó por el número de RUC: todavía no se guarda en la ficha del cliente.");
    idReceptor = rucRec.numero;
    gDatRec = {
      iNatRec: 1,
      iTiOpe: 1,
      cPaisRec: "PRY",
      dDesPaisRe: "Paraguay",
      iTiContRec: tipoContribuyenteDeRuc(rucRec.numero),
      dRucRec: rucRec.numero,
      dDVRec: rucRec.dv || undefined,
      dNomRec: nombreReceptor,
      dEmailRec: emailReceptor,
    };
  } else {
    const tipoDoc = rec.tipoDocumento ?? 9;
    const numero = esInnominado ? "0" : limpiarDocumento(c.receptorNumeroIdentificacion);
    if (!esInnominado && !/^[0-9A-Za-z-]{1,20}$/.test(numero)) {
      faltantes.push(`El número de documento del comprador no es válido (${numero ? `"${numero}"` : "está vacío"})`);
    }
    idReceptor = numero || "0";
    gDatRec = {
      iNatRec: 2,
      iTiOpe: 2,
      cPaisRec: "PRY",
      dDesPaisRe: "Paraguay",
      iTipIDRec: tipoDoc,
      dDTipIDRec: DESCRIPCION_DOCUMENTO_RECEPTOR[tipoDoc] ?? "Otro",
      dNumIDRec: numero,
      dNomRec: esInnominado ? "Sin Nombre" : nombreReceptor,
      dEmailRec: emailReceptor,
    };
  }

  // ------------------------------------------------- condición y forma de pago
  let gCamCond: Nodo;
  if (c.condicion === "credito") {
    const dias = c.fechaVencimientoCredito ? plazoEnDias(c.fechaEmision, c.fechaVencimientoCredito) : 30;
    gCamCond = {
      iCondOpe: CONDICION_SIFEN.credito,
      dDCondOpe: "Crédito",
      gPagCred: { iCondCred: 1, dDCondCred: "Plazo", dPlazoCre: `${dias} días` },
    };
  } else {
    if (pagos.length === 0) {
      faltantes.push("La operación al contado necesita al menos una forma de pago registrada");
    } else {
      const sumaPagos = pagos.reduce((s, p) => s + p.monto, 0);
      if (Math.abs(sumaPagos - dTotOpe) > 1) faltantes.push(`Los pagos suman ${gs(sumaPagos)} y el documento es de ${dTotOpe}`);
    }
    let hayTarjeta = false;
    gCamCond = {
      iCondOpe: CONDICION_SIFEN.contado,
      dDCondOpe: "Contado",
      gPaConEIni: pagos.map((p) => {
        const tipo = codigoTipoPago(p.forma);
        const pago: Nodo = {
          iTiPago: tipo,
          dDesTiPag: DESCRIPCION_TIPO_PAGO[tipo] ?? "Otro",
          dMonTiPag: gs(p.monto),
          cMoneTiPag: "PYG",
          dDMoneTiPag: "Guarani",
        };
        if (tipo === 3 || tipo === 4) {
          hayTarjeta = true;
          // La DNIT pide la denominación de la tarjeta y cómo se procesó el pago; el sistema todavía no guarda la marca.
          pago.gPagTarCD = { iDenTarj: 99, dDesDenTarj: "Otra tarjeta", iForProPa: 1 };
        }
        return pago;
      }),
    };
    if (hayTarjeta) {
      avisos.push("Los pagos con tarjeta salen como \"Otra tarjeta\" procesada por POS: el sistema todavía no guarda la marca (Visa, Mastercard…) ni el código de autorización.");
    }
  }

  // ----------------------------------------------------------------- el árbol DE
  const fechaCdc = claveDiaAsuncion(c.fechaEmision).replace(/-/g, "");
  const numeroDoc = String(c.correlativo).padStart(7, "0");
  const codigoSeguridad = op.codigoSeguridad ?? generarCodigoSeguridad(numeroDoc);
  if (!/^\d{9}$/.test(codigoSeguridad) || Number(codigoSeguridad) < 1) {
    faltantes.push("El código de seguridad tiene que ser un número de 9 dígitos mayor que cero");
  }

  const tipoEmision = (TIPO_EMISION_SIFEN as Record<string, number>)[c.tipoEmision] ?? 1;
  const tipoTransaccion = (TIPO_TRANSACCION_SIFEN as Record<string, number>)[c.tipoTransaccion] ?? 1;
  const presencia = (PRESENCIA_SIFEN as Record<string, number>)[c.presencia] ?? 1;

  let cdc: string | null = null;
  try {
    cdc = construirCdc({
      tipoDocumento,
      rucEmisor: rucEmisor.numero,
      dvRuc: rucEmisor.dv,
      establecimiento: c.establecimiento,
      punto: c.punto,
      numero: numeroDoc,
      tipoContribuyente: tipoContEmisor ?? 1,
      fecha: fechaCdc,
      tipoEmision,
      codigoSeguridad,
    });
  } catch {
    // Los datos que faltan ya están en `faltantes`; sin ellos no hay CDC.
    cdc = null;
  }
  if (cdc === null) return { de: null, cdc: null, faltantes, avisos };

  const de: Nodo = {
    "@Id": cdc,
    dDVId: cdc.slice(43),
    dFecFirma: fechaHoraIso(op.fechaFirma),
    dSisFact: 1,
    gOpeDE: {
      iTipEmi: tipoEmision,
      dDesTipEmi: DESCRIPCION_TIPO_EMISION[tipoEmision],
      dCodSeg: codigoSeguridad,
    },
    gTimb: {
      iTiDE: tipoDocumento,
      dDesTiDE: DESCRIPCION_TIPO_DOCUMENTO[tipoDocumento],
      dNumTim: timbrado,
      dEst: c.establecimiento,
      dPunExp: c.punto,
      dNumDoc: numeroDoc,
      dFeIniT: fechaInicioTimbrado ?? undefined,
    },
    gDatGralOpe: {
      dFeEmiDE: fechaHoraIso(c.fechaEmision),
      gOpeCom: {
        iTipTra: tipoTransaccion,
        dDesTipTra: DESCRIPCION_TIPO_TRANSACCION[tipoTransaccion],
        iTImp: TIPO_IMPUESTO_IVA,
        dDesTImp: "IVA",
        cMoneOpe: "PYG",
        dDesMoneOpe: "Guarani",
      },
      gEmis,
      gDatRec,
    },
    gDtipDE: {
      gCamFE: { iIndPres: presencia, dDesIndPres: DESCRIPCION_PRESENCIA[presencia] },
      gCamCond,
      gCamItem,
    },
    gTotSub,
  };

  // Las mismas cuentas que hace la DNIT al recibir el documento: si alguna no cierra, el error es nuestro.
  for (const problema of controlarCalculos(de)) faltantes.push(`Cuenta que no cierra: ${problema}`);

  // Lo que el esquema oficial rechazaría y no se explicó arriba con un mensaje propio (los datos del emisor ya
  // se explicaron con sus nombres de pantalla).
  for (const e of validarContraEsquema({ dVerFor: 150, DE: de }, { sinFirma: true })) {
    if (faltanEmisor.length > 0 && e.ruta.includes("/gEmis/")) continue;
    faltantes.push(`${e.ruta.replace(/^\/rDE\//, "")}: ${e.mensaje}`);
  }

  return { de, cdc, faltantes, avisos };
}

/**
 * Envuelve el DE en el documento raíz (rDE). La firma y el código QR se agregan en la etapa de firma, porque el QR
 * lleva el DigestValue de la firma: hasta entonces el documento está completo pero sin firmar.
 */
export function armarRDE(de: Nodo, firmaXml?: string, urlQr?: string): Nodo {
  const rde: Nodo = { dVerFor: 150, DE: de };
  if (firmaXml) rde.Signature = firmaXml;
  if (urlQr) rde.gCamFuFD = { dCarQR: urlQr };
  return rde;
}
