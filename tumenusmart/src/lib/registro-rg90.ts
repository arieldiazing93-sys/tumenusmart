import { prismaDelLocal } from "./prisma-local";
import { fechaAsuncionDesdeTexto, ZONA_NEGOCIO } from "./timezone";
import { SIN_REGISTRO_FISCAL, TIPOS_IDENTIFICACION_FISCAL } from "./tipo-cliente";
import { crearZip } from "./zip-simple";

/**
 * Archivo de importación de comprobantes de VENTAS y de COMPRAS para el Sistema
 * Marangatú de la DNIT — el "Registro de Comprobantes" de la Resolución General
 * N° 90/2021.
 *
 * Sigue la "Especificación Técnica para Importación — Registro de Comprobantes
 * de Ventas, Compras, Ingresos y/o Egresos" (junio 2021) y la guía paso a paso
 * de importación de la DNIT, leídas del documento oficial (no de memoria):
 *
 *  - Archivo .CSV (delimitado por comas) o .TXT (delimitado por tabulaciones),
 *    en UTF-8, SIN fila de encabezado.
 *  - Nombre <RUC>_REG_MMAAAA_XXXXX (obligación 955, registro mensual): el RUC del
 *    contribuyente SIN dígito verificador, el mes y año, y un identificador de
 *    hasta 5 caracteres distinto para cada archivo.
 *  - Comprimido en .zip con el mismo nombre del archivo que contiene.
 *  - Máximo 5.000 filas de datos por archivo: si hay más, se arman varios lotes.
 *  - Ventas: 19 columnas, en este orden (ver `armarFila`). Compras: 20 columnas
 *    (ver `armarFilaCompra`): las de ventas, con el proveedor en lugar del
 *    comprador y la condición de COMPRA, más la columna "no imputa".
 *  - Cada tipo de registro va en su propio archivo (V0001 para ventas, C0001
 *    para compras): la especificación permite mezclarlos o separarlos.
 *  - Los montos van como enteros sin decimales, con IVA incluido, y el total es
 *    exactamente la suma de gravado 10%, gravado 5% y exento.
 *  - Los RUC van sin dígito verificador.
 *  - No se incluyen comprobantes de e-Kuatia (SIFEN) ni de Comprobantes
 *    Virtuales: acá solo hay facturas autoimpresor, que es lo que se registra.
 *
 * Ventas: solo entran las facturas VIGENTES: el formato exige un total mayor a
 * cero y no tiene ningún campo para marcar un comprobante anulado, así que una
 * factura anulada (sola, o porque se canceló la cuenta) no se informa.
 *
 * Compras: entran las compras no canceladas cargadas con folio y/o timbrado de
 * la factura del proveedor. Una compra sin ninguno de los dos no tiene
 * comprobante que informar y se deja afuera; si tiene alguno pero le falta algo
 * de lo que el formato exige (folio, timbrado, RUC del proveedor), el archivo no
 * se arma y se avisa cuál es.
 */

/** Cuántas filas de datos admite un archivo. */
export const MAX_FILAS_POR_ARCHIVO = 5000;

/** Códigos de la Tabla 4 de la especificación (comprobantes de ventas). */
const TIPO_COMPROBANTE_FACTURA = "109";
/** Códigos de la Tabla 2 (condición de la operación). */
const CONDICION_CONTADO = "1";
const CONDICION_CREDITO = "2";

export type SiNo = "S" | "N";

export type OpcionesRg90 = {
  anio: number;
  /** 1 a 12 */
  mes: number;
  /** A qué obligaciones se imputan las facturas (Tabla 5). Al menos una tiene que ser "S". */
  imputaIva: SiNo;
  imputaIre: SiNo;
  imputaIrpRsp: SiNo;
  /** "csv" (comas) o "txt" (tabulaciones). */
  formato: "csv" | "txt";
  /** Número del primer archivo: V0001, V0002... Cada archivo lleva uno distinto. */
  primerArchivo: number;
  /** Sumar también las compras del mes (facturas de proveedores), en su propio archivo. */
  incluirCompras: boolean;
};

export type ResultadoRg90 =
  | {
      ok: true;
      /** El archivo listo para bajar (un .zip; con varios lotes, un .zip que trae un .zip por lote). */
      zip: Uint8Array;
      nombreZip: string;
      facturas: number;
      compras: number;
      lotes: number;
    }
  | { ok: false; motivo: "sin_facturas" }
  | { ok: false; motivo: "incompletas"; detalle: string[] }
  | { ok: false; motivo: "sin_ruc" };

type FacturaBase = {
  fecha: Date;
  numero: string | null;
  timbrado: string | null;
  tipoIdentificacion: string | null;
  identificacion: string | null;
  razonSocial: string | null;
  gravado10: unknown;
  gravado5: unknown;
  exento: unknown;
  rucEmisor: string | null;
  /** true si la venta fue a crédito (condición 2 en el registro); si no, contado. */
  aCredito: boolean;
};

/** Partes de un monto repartidas en enteros que suman justo el total redondeado. */
export function repartirEnEnteros(partes: number[]): number[] {
  const total = Math.round(partes.reduce((s, p) => s + p, 0));
  const pisos = partes.map((p) => Math.floor(p));
  let resto = total - pisos.reduce((s, p) => s + p, 0);
  // Los enteros que faltan se reparten a las partes con más decimales.
  const porDecimales = partes.map((p, i) => ({ i, dec: p - Math.floor(p) })).sort((a, b) => b.dec - a.dec);
  const resultado = [...pisos];
  for (const { i } of porDecimales) {
    if (resto <= 0) break;
    resultado[i] += 1;
    resto -= 1;
  }
  return resultado;
}

/** El RUC sin su dígito verificador ("80012345-6" → "80012345"). */
export function rucSinDv(ruc: string | null | undefined): string {
  const limpio = (ruc ?? "").trim();
  return limpio.split("-")[0].replace(/\s+/g, "");
}

/**
 * "24/09/2026". Las facturas emitidas son un instante: el día es el de Asunción.
 * La fecha de una compra se guarda como el día elegido a medianoche UTC: su día es el UTC.
 */
function fechaComprobante(fecha: Date, zona: string = ZONA_NEGOCIO): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: zona,
  }).format(fecha);
}

function codigoDeIdentificacion(tipo: string | null): string {
  if (tipo === SIN_REGISTRO_FISCAL.tipo) return SIN_REGISTRO_FISCAL.codigoSet;
  // Facturas viejas sin tipo guardado: eran RUC, igual que en el ticket.
  return TIPOS_IDENTIFICACION_FISCAL.find((t) => t.valor === tipo)?.codigoSet ?? "11";
}

function numeroDeIdentificacion(tipo: string | null, numero: string | null): string {
  const limpio = (numero ?? "").trim();
  if (tipo === SIN_REGISTRO_FISCAL.tipo) return limpio || SIN_REGISTRO_FISCAL.numero;
  const t = tipo ?? "ruc";
  // RUC: sin dígito verificador. Cédula: solo el número, sin puntos ni espacios.
  if (t === "ruc") return rucSinDv(limpio);
  if (t === "cedula") return limpio.replace(/[^0-9A-Za-z]/g, "");
  return limpio.replace(/\s+/g, "");
}

/** Los límites de un mes calendario en hora de Asunción: desde el inicio del mes hasta el inicio del siguiente (sin incluirlo). */
function limitesDelMes(anio: number, mes: number): { gte: Date; lt: Date } {
  const dosDigitos = (n: number) => String(n).padStart(2, "0");
  const siguiente = mes === 12 ? { anio: anio + 1, mes: 1 } : { anio, mes: mes + 1 };
  return {
    gte: fechaAsuncionDesdeTexto(`${anio}-${dosDigitos(mes)}-01`) ?? new Date(Date.UTC(anio, mes - 1, 1)),
    lt: fechaAsuncionDesdeTexto(`${siguiente.anio}-${dosDigitos(siguiente.mes)}-01`) ?? new Date(Date.UTC(siguiente.anio, siguiente.mes - 1, 1)),
  };
}

/** Un campo de texto listo para el archivo: sin saltos de línea y, en CSV, entre comillas si hace falta. */
function campo(valor: string, formato: "csv" | "txt"): string {
  const limpio = valor.replace(/[\r\n\t]+/g, " ").trim();
  if (formato === "txt") return limpio;
  return /[",]/.test(limpio) ? `"${limpio.replace(/"/g, '""')}"` : limpio;
}

/**
 * Las 19 columnas de un comprobante de ventas, en el orden de la especificación.
 * Devuelve null si a la factura le falta algo que el formato exige.
 */
function armarFila(f: FacturaBase, o: OpcionesRg90): string[] | null {
  const numero = (f.numero ?? "").trim();
  if (!/^\d{3}-\d{3}-\d{7}$/.test(numero)) return null;
  const timbrado = (f.timbrado ?? "").replace(/\D/g, "");
  if (!/^\d{1,8}$/.test(timbrado)) return null;

  const codigoTipo = codigoDeIdentificacion(f.tipoIdentificacion);
  const idComprador = numeroDeIdentificacion(f.tipoIdentificacion, f.identificacion).slice(0, 20);
  if (!idComprador) return null;

  // El nombre se pide para todos los tipos menos RUC (11), Cédula (12) y Sin
  // Nombre (15): esos los resuelve Marangatú con sus propios registros.
  const llevaNombre = !["11", "12", "15"].includes(codigoTipo);
  const nombre = llevaNombre ? (f.razonSocial ?? "").trim().slice(0, 250) : "";
  if (llevaNombre && !nombre) return null;

  // Enteros que suman justo el total (el formato exige total = suma de las tres partes).
  const [g10, g5, exento] = repartirEnEnteros([Number(f.gravado10 ?? 0), Number(f.gravado5 ?? 0), Number(f.exento ?? 0)]);
  const total = g10 + g5 + exento;
  if (total <= 0) return null;

  return [
    "1", //                                 1  tipo de registro: ventas
    codigoTipo, //                          2  tipo de identificación del comprador
    idComprador, //                         3  número de identificación del comprador
    nombre, //                              4  nombre o razón social
    TIPO_COMPROBANTE_FACTURA, //            5  tipo de comprobante: factura
    fechaComprobante(f.fecha), //           6  fecha de emisión
    timbrado, //                            7  número de timbrado
    numero, //                              8  número del comprobante
    String(g10), //                         9  monto gravado al 10% (IVA incluido)
    String(g5), //                         10  monto gravado al 5% (IVA incluido)
    String(exento), //                     11  monto no gravado o exento
    String(total), //                      12  monto total del comprobante
    f.aCredito ? CONDICION_CREDITO : CONDICION_CONTADO, // 13 condición de venta
    "N", //                                14  operación en moneda extranjera
    o.imputaIva, //                        15  imputa al IVA
    o.imputaIre, //                        16  imputa al IRE
    o.imputaIrpRsp, //                     17  imputa al IRP-RSP
    "", //                                 18  comprobante asociado (solo notas de crédito/débito)
    "", //                                 19  timbrado del comprobante asociado
  ];
}

type CompraBase = {
  fecha: Date;
  folio: string | null;
  timbrado: string | null;
  condicionPago: string;
  rucProveedor: string | null;
  descuentoGeneralPorcentaje: number;
  items: { subtotal: number; iva: string }[];
};

/**
 * Las 20 columnas de un comprobante de compras, en el orden de la especificación.
 * Si a la compra le falta algo que el formato exige, devuelve qué falta.
 */
function armarFilaCompra(c: CompraBase, o: OpcionesRg90): { fila: string[] } | { faltan: string[] } {
  const faltan: string[] = [];

  const folio = (c.folio ?? "").trim();
  if (!/^\d{3}-\d{3}-\d{7}$/.test(folio)) faltan.push("el folio con formato 001-001-0000001");
  const timbrado = (c.timbrado ?? "").replace(/\D/g, "");
  if (!/^\d{1,8}$/.test(timbrado)) faltan.push("el timbrado");
  const ruc = rucSinDv(c.rucProveedor).slice(0, 20);
  if (!ruc) faltan.push("el RUC del proveedor");

  // Lo que se guardó de cada línea es neto, con el descuento de línea; el descuento
  // general baja el neto de todas. Acá se lleva a lo que dice la factura: con IVA
  // incluido, separado por tasa.
  const factorGeneral = 1 - Math.min(Math.max(c.descuentoGeneralPorcentaje, 0), 100) / 100;
  let neto10 = 0;
  let neto5 = 0;
  let netoExento = 0;
  for (const item of c.items) {
    const neto = item.subtotal * factorGeneral;
    if (item.iva === "gravado10") neto10 += neto;
    else if (item.iva === "gravado5") neto5 += neto;
    else netoExento += neto;
  }
  // Enteros que suman justo el total (el formato exige total = suma de las tres partes).
  const [g10, g5, exento] = repartirEnEnteros([neto10 * 1.1, neto5 * 1.05, netoExento]);
  const total = g10 + g5 + exento;
  if (total <= 0) faltan.push("un total mayor a cero");

  if (faltan.length > 0) return { faltan };

  return {
    fila: [
      "2", //                                 1  tipo de registro: compras
      "11", //                                2  tipo de identificación del proveedor: RUC
      ruc, //                                 3  RUC del proveedor (sin dígito verificador)
      "", //                                  4  razón social (no se pide con RUC: Marangatú la resuelve)
      TIPO_COMPROBANTE_FACTURA, //            5  tipo de comprobante: factura
      fechaComprobante(c.fecha, "UTC"), //    6  fecha de emisión de la factura
      timbrado, //                            7  número de timbrado del proveedor
      folio, //                               8  número del comprobante
      String(g10), //                         9  monto gravado al 10% (IVA incluido)
      String(g5), //                         10  monto gravado al 5% (IVA incluido)
      String(exento), //                     11  monto no gravado o exento
      String(total), //                      12  monto total del comprobante
      c.condicionPago === "credito" ? CONDICION_CREDITO : CONDICION_CONTADO, // 13 condición de compra
      "N", //                                14  operación en moneda extranjera
      o.imputaIva, //                        15  imputa al IVA
      o.imputaIre, //                        16  imputa al IRE
      o.imputaIrpRsp, //                     17  imputa al IRP-RSP
      "N", //                                18  no imputa
      "", //                                 19  comprobante asociado (solo notas de crédito/débito)
      "", //                                 20  timbrado del comprobante asociado
    ],
  };
}

/**
 * Arma el .zip del registro de un mes: las facturas vigentes de VENTAS (de
 * pedidos y de mostrador) emitidas en ese mes, en hora de Asunción, y —si se
 * pide— las COMPRAS con factura de proveedor de ese mes, cada tipo en su archivo.
 */
export async function armarRegistroRg90(storeId: string, o: OpcionesRg90): Promise<ResultadoRg90> {
  const db = prismaDelLocal(storeId);
  const { gte, lt } = limitesDelMes(o.anio, o.mes);

  const campos = {
    facturaNumero: true,
    facturaTimbrado: true,
    facturaTipoIdentificacion: true,
    facturaRuc: true,
    facturaRazonSocial: true,
    facturaGravado10: true,
    facturaGravado5: true,
    facturaExento: true,
    facturaRucEmisor: true,
  } as const;

  const [pedidos, ventas] = await Promise.all([
    db.order.findMany({
      where: {
        comprobanteTipo: "factura",
        facturaNumero: { not: null },
        facturaAnulada: false,
        estado: { not: "cancelado" },
        createdAt: { gte, lt },
      },
      select: { createdAt: true, ...campos },
    }),
    db.ventaPos.findMany({
      where: {
        comprobanteTipo: "factura",
        facturaNumero: { not: null },
        facturaAnulada: false,
        cancelada: false,
        creadoEn: { gte, lt },
      },
      select: { creadoEn: true, formaPago: true, ...campos },
    }),
  ]);

  const facturas: FacturaBase[] = [
    ...pedidos.map((p) => ({
      fecha: p.createdAt,
      numero: p.facturaNumero,
      timbrado: p.facturaTimbrado,
      tipoIdentificacion: p.facturaTipoIdentificacion,
      identificacion: p.facturaRuc,
      razonSocial: p.facturaRazonSocial,
      gravado10: p.facturaGravado10,
      gravado5: p.facturaGravado5,
      exento: p.facturaExento,
      rucEmisor: p.facturaRucEmisor,
      aCredito: false,
    })),
    ...ventas.map((v) => ({
      fecha: v.creadoEn,
      numero: v.facturaNumero,
      timbrado: v.facturaTimbrado,
      tipoIdentificacion: v.facturaTipoIdentificacion,
      identificacion: v.facturaRuc,
      razonSocial: v.facturaRazonSocial,
      gravado10: v.facturaGravado10,
      gravado5: v.facturaGravado5,
      exento: v.facturaExento,
      rucEmisor: v.facturaRucEmisor,
      aCredito: v.formaPago === "a_credito",
    })),
  ].sort((a, b) => a.fecha.getTime() - b.fecha.getTime() || (a.numero ?? "").localeCompare(b.numero ?? ""));

  // Antes de armar nada, que ningún comprobante tenga datos incompletos: un archivo
  // de impuestos al que le faltan comprobantes sin avisar es peor que no tenerlo.
  const filas: string[][] = [];
  const filasCompras: string[][] = [];
  const incompletas: string[] = [];
  for (const f of facturas) {
    const fila = armarFila(f, o);
    if (fila) filas.push(fila);
    else incompletas.push(`factura ${f.numero ?? "(sin número)"}`);
  }

  if (o.incluirCompras) {
    // La fecha de una compra es el día que se eligió, guardado a medianoche UTC:
    // el mes se corta en UTC, no en hora de Asunción.
    const compras = await db.compra.findMany({
      where: {
        cancelada: false,
        fecha: { gte: new Date(Date.UTC(o.anio, o.mes - 1, 1)), lt: new Date(Date.UTC(o.anio, o.mes, 1)) },
      },
      orderBy: [{ fecha: "asc" }, { createdAt: "asc" }],
      select: {
        fecha: true,
        numeroComprobante: true,
        timbrado: true,
        condicionPago: true,
        descuentoGeneralPorcentaje: true,
        proveedor: { select: { ruc: true } },
        items: { select: { subtotal: true, iva: true } },
      },
    });
    for (const c of compras) {
      const folio = c.numeroComprobante?.trim() ?? "";
      // Sin folio ni timbrado no hay factura del proveedor: no hay nada que informar.
      if (!folio && !c.timbrado) continue;
      const resultado = armarFilaCompra(
        {
          fecha: c.fecha,
          folio,
          timbrado: c.timbrado,
          condicionPago: c.condicionPago,
          rucProveedor: c.proveedor?.ruc ?? null,
          descuentoGeneralPorcentaje: Number(c.descuentoGeneralPorcentaje ?? 0),
          items: c.items.map((i) => ({ subtotal: Number(i.subtotal), iva: i.iva })),
        },
        o
      );
      if ("fila" in resultado) filasCompras.push(resultado.fila);
      else {
        const cual = folio ? `folio ${folio}` : `del ${fechaComprobante(c.fecha, "UTC")}`;
        incompletas.push(`compra ${cual} (le falta ${resultado.faltan.join(", ")})`);
      }
    }
  }

  if (incompletas.length > 0) return { ok: false, motivo: "incompletas", detalle: incompletas };
  if (filas.length === 0 && filasCompras.length === 0) return { ok: false, motivo: "sin_facturas" };

  // El RUC del contribuyente para el nombre del archivo: el que quedó impreso en
  // las facturas (el más frecuente) o, si son viejas y no lo guardaron, el del punto de expedición.
  const conteoRuc = new Map<string, number>();
  for (const f of facturas) {
    const ruc = rucSinDv(f.rucEmisor);
    if (ruc) conteoRuc.set(ruc, (conteoRuc.get(ruc) ?? 0) + 1);
  }
  let ruc = [...conteoRuc.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  if (!ruc) {
    const punto = await db.puntoExpedicion.findFirst({ orderBy: { activo: "desc" }, select: { rucEmisor: true } });
    ruc = rucSinDv(punto?.rucEmisor);
  }
  if (!ruc) return { ok: false, motivo: "sin_ruc" };

  const separador = o.formato === "txt" ? "\t" : ",";
  const extension = o.formato === "txt" ? "txt" : "csv";
  const periodo = `${String(o.mes).padStart(2, "0")}${o.anio}`;
  const codificar = new TextEncoder();

  // Un archivo por cada 5.000 filas, cada uno en su propio .zip con su mismo nombre.
  // Las ventas llevan V0001, V0002…; las compras, C0001, C0002… (mismo número inicial).
  const zips: { nombre: string; datos: Uint8Array }[] = [];
  const armarLotes = (todas: string[][], letra: "V" | "C") => {
    for (let desde = 0, lote = 0; desde < todas.length; desde += MAX_FILAS_POR_ARCHIVO, lote++) {
      const identificador = `${letra}${String(o.primerArchivo + lote).padStart(4, "0")}`;
      const nombre = `${ruc}_REG_${periodo}_${identificador}`;
      const contenido = todas
        .slice(desde, desde + MAX_FILAS_POR_ARCHIVO)
        .map((fila) => fila.map((v) => campo(v, o.formato)).join(separador))
        .join("\r\n") + "\r\n";
      zips.push({
        nombre: `${nombre}.zip`,
        datos: crearZip([{ nombre: `${nombre}.${extension}`, datos: codificar.encode(contenido) }]),
      });
    }
  };
  armarLotes(filas, "V");
  armarLotes(filasCompras, "C");

  // Un solo lote: se baja el .zip tal cual se sube a Marangatú. Varios: un .zip que los agrupa.
  if (zips.length === 1) {
    return {
      ok: true,
      zip: zips[0].datos,
      nombreZip: zips[0].nombre,
      facturas: filas.length,
      compras: filasCompras.length,
      lotes: 1,
    };
  }
  return {
    ok: true,
    zip: crearZip(zips),
    nombreZip: `${ruc}_REG_${periodo}_lotes.zip`,
    facturas: filas.length,
    compras: filasCompras.length,
    lotes: zips.length,
  };
}
