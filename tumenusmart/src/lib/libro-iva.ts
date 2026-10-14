/**
 * Libro IVA Ventas, Libro IVA Compras y Resumen del IVA del mes.
 *
 * Son los reportes de contabilidad del contribuyente del IVA. Desde la Resolución General N° 90/2021 de la DNIT el libro en sí ya no se
 * presenta (la información se confirma por Marangatú, ver registro-rg90.ts), pero el modelo oficial de libro (RG 55/2020) sigue siendo
 * lo que mira el contador para conciliar y armar la declaración, así que acá se arma con SUS columnas:
 *
 *   Ventas:  tipo y N° de identificación, nombre, tipo de comprobante, timbrado, número, fecha, importe total, exenta, gravadas 5 %
 *            (IVA incluido), IVA 5 % (= gravadas ÷ 21), gravadas 10 % (IVA incluido), IVA 10 % (= gravadas ÷ 11), total sin IVA.
 *   Compras: las mismas con el proveedor y la condición (contado / crédito).
 *
 * Todo en guaraníes ENTEROS, y el total de cada comprobante es exactamente la suma de sus partes (la misma cuenta del archivo RG 90).
 *
 * Lógica pura (sin Prisma ni pantalla): la lectura de la base está en libro-iva-servidor.ts y se prueba con todos los casos.
 */

import { repartirEnEnteros } from "./enteros";

// ---------------------------------------------------------------------------------------------------------------------
//  Montos
// ---------------------------------------------------------------------------------------------------------------------

/** Las columnas de importes de un comprobante (IVA incluido), en guaraníes enteros. `total` es exactamente la suma de las tres bases. */
export type DesgloseLibro = {
  total: number;
  exento: number;
  gravado5: number;
  /** El IVA contenido en las gravadas al 5 % (gravadas ÷ 21), al guaraní. */
  iva5: number;
  gravado10: number;
  /** El IVA contenido en las gravadas al 10 % (gravadas ÷ 11), al guaraní. */
  iva10: number;
  /** El total menos el IVA (total − IVA 5 % − IVA 10 %). */
  sinIva: number;
};

/** De los tres montos con IVA incluido al desglose del libro: enteros que suman justo el total, y el IVA de cada tasa. */
export function desgloseLibro(gravado10: number, gravado5: number, exento: number): DesgloseLibro {
  const [g10, g5, ex] = repartirEnEnteros([gravado10, gravado5, exento]);
  const iva10 = Math.round(g10 / 11);
  const iva5 = Math.round(g5 / 21);
  const total = g10 + g5 + ex;
  return { total, exento: ex, gravado5: g5, iva5, gravado10: g10, iva10, sinIva: total - iva5 - iva10 };
}

/**
 * Lo que dice la factura de un proveedor, a partir de las líneas de la compra: lo guardado de cada línea es neto (sin IVA, con el
 * descuento de línea) y el descuento general baja el neto de todas; acá se lleva a lo que dice la factura —con IVA incluido, separado por
 * tasa— en guaraníes enteros. Devuelve [gravado 10 %, gravado 5 %, exento]. Es la MISMA cuenta que arma el archivo RG 90.
 */
export function montosDeCompra(
  lineas: { subtotal: number; iva: string }[],
  descuentoGeneralPorcentaje: number
): [number, number, number] {
  const factorGeneral = 1 - Math.min(Math.max(descuentoGeneralPorcentaje, 0), 100) / 100;
  let neto10 = 0;
  let neto5 = 0;
  let netoExento = 0;
  for (const linea of lineas) {
    const neto = linea.subtotal * factorGeneral;
    if (linea.iva === "gravado10") neto10 += neto;
    else if (linea.iva === "gravado5") neto5 += neto;
    else netoExento += neto;
  }
  const [g10, g5, exento] = repartirEnEnteros([neto10 * 1.1, neto5 * 1.05, netoExento]);
  return [g10, g5, exento];
}

/** Un gasto con factura: el monto pagado (IVA incluido) está todo en la tasa que se eligió. Devuelve [gravado 10 %, gravado 5 %, exento]. */
export function montosDeGasto(monto: number, iva: string): [number, number, number] {
  const m = Math.round(monto);
  if (iva === "gravado10") return [m, 0, 0];
  if (iva === "gravado5") return [0, m, 0];
  return [0, 0, m];
}

// ---------------------------------------------------------------------------------------------------------------------
//  Libro de ventas
// ---------------------------------------------------------------------------------------------------------------------

/** Una factura emitida, tal como sale de la base. Los tres montos son los de la factura (IVA incluido). */
export type FacturaVentaBase = {
  id: string;
  fecha: Date;
  /** "ruc" | "cedula" | … | "sin_nombre" (ver tipo-cliente.ts). */
  tipoIdentificacion: string | null;
  identificacion: string | null;
  razonSocial: string | null;
  timbrado: string | null;
  numero: string | null;
  gravado10: number;
  gravado5: number;
  exento: number;
  /** Cómo se emitió: talonario autorizado (autoimpresor) o factura electrónica (SIFEN). */
  modalidad: "autoimpresor" | "electronico";
  aCredito: boolean;
};

export type FilaLibroVentas = DesgloseLibro & {
  id: string;
  fecha: Date;
  tipoIdentificacion: string;
  identificacion: string;
  razonSocial: string;
  timbrado: string;
  numero: string;
  modalidad: "autoimpresor" | "electronico";
  condicion: "contado" | "credito";
};

/** El RUC que usa el modelo oficial del libro para el comprador no identificado. */
export const RUC_CONSUMIDOR_FINAL = "44444401";

const ETIQUETAS_IDENTIFICACION: Record<string, string> = {
  ruc: "RUC",
  cedula: "Cédula de identidad",
  pasaporte: "Pasaporte",
  cedula_extranjera: "Cédula extranjera",
  diplomatico: "Diplomático",
  identificacion_tributaria: "Identificación tributaria",
  sin_nombre: "Sin nombre",
};

export function etiquetaIdentificacion(tipo: string | null): string {
  // Las facturas viejas sin tipo guardado eran RUC, igual que en el ticket.
  return ETIQUETAS_IDENTIFICACION[tipo ?? "ruc"] ?? "RUC";
}

export function filaLibroVentas(f: FacturaVentaBase): FilaLibroVentas {
  const sinNombre = f.tipoIdentificacion === "sin_nombre";
  return {
    ...desgloseLibro(f.gravado10, f.gravado5, f.exento),
    id: f.id,
    fecha: f.fecha,
    tipoIdentificacion: etiquetaIdentificacion(f.tipoIdentificacion),
    identificacion: sinNombre ? RUC_CONSUMIDOR_FINAL : (f.identificacion ?? "").trim(),
    razonSocial: sinNombre ? "Consumidor Final" : (f.razonSocial ?? "").trim(),
    timbrado: (f.timbrado ?? "").trim(),
    numero: (f.numero ?? "").trim(),
    modalidad: f.modalidad,
    condicion: f.aCredito ? "credito" : "contado",
  };
}

// ---------------------------------------------------------------------------------------------------------------------
//  Libro de compras
// ---------------------------------------------------------------------------------------------------------------------

/** Una compra o un gasto con factura de proveedor. `montos`: [gravado 10 %, gravado 5 %, exento] con IVA incluido. */
export type ComprobanteCompraBase = {
  id: string;
  origen: "compra" | "gasto";
  fecha: Date;
  folio: string | null;
  timbrado: string | null;
  rucProveedor: string | null;
  razonSocial: string | null;
  aCredito: boolean;
  montos: [number, number, number];
};

export type FilaLibroCompras = DesgloseLibro & {
  id: string;
  origen: "compra" | "gasto";
  fecha: Date;
  tipoIdentificacion: string;
  identificacion: string;
  razonSocial: string;
  timbrado: string;
  numero: string;
  condicion: "contado" | "credito";
  /** Qué le falta al comprobante para poder tomar su IVA como crédito fiscal (vacío si está completo). */
  faltan: string[];
};

const FORMATO_NUMERO = /^\d{3}-\d{3}-\d{7}$/;

export function filaLibroCompras(c: ComprobanteCompraBase): FilaLibroCompras {
  const folio = (c.folio ?? "").trim();
  const timbrado = (c.timbrado ?? "").replace(/\D/g, "");
  const ruc = (c.rucProveedor ?? "").trim();
  const faltan: string[] = [];
  if (!FORMATO_NUMERO.test(folio)) faltan.push("el folio con formato 001-001-0000001");
  if (!/^\d{1,8}$/.test(timbrado)) faltan.push("el timbrado");
  if (!ruc) faltan.push("el RUC del proveedor");
  return {
    ...desgloseLibro(c.montos[0], c.montos[1], c.montos[2]),
    id: c.id,
    origen: c.origen,
    fecha: c.fecha,
    tipoIdentificacion: "RUC",
    identificacion: ruc,
    razonSocial: (c.razonSocial ?? "").trim(),
    timbrado,
    numero: folio,
    condicion: c.aCredito ? "credito" : "contado",
    faltan,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
//  Totales y resumen del IVA
// ---------------------------------------------------------------------------------------------------------------------

export type TotalesLibro = DesgloseLibro & { comprobantes: number };

export function totalizar(filas: DesgloseLibro[]): TotalesLibro {
  const t: TotalesLibro = { comprobantes: filas.length, total: 0, exento: 0, gravado5: 0, iva5: 0, gravado10: 0, iva10: 0, sinIva: 0 };
  for (const f of filas) {
    t.total += f.total;
    t.exento += f.exento;
    t.gravado5 += f.gravado5;
    t.iva5 += f.iva5;
    t.gravado10 += f.gravado10;
    t.iva10 += f.iva10;
    t.sinIva += f.sinIva;
  }
  return t;
}

export type ResumenIva = {
  /** Las facturas emitidas del período (vigentes). */
  ventas: TotalesLibro;
  /** Cuántas facturas se anularon en el período (no suman: no tienen importe). */
  facturasAnuladas: number;
  /** Las compras y gastos con factura COMPLETA: son las que dan crédito fiscal. */
  compras: TotalesLibro;
  /** Las que tienen la factura incompleta: su IVA todavía no se puede tomar. */
  comprasIncompletas: TotalesLibro;
  /** Cuántas compras no tienen factura del proveedor (sin folio ni timbrado): no entran al libro. */
  comprasSinComprobante: number;
  /** IVA de las ventas (10 % + 5 %). */
  debitoFiscal: number;
  /** IVA de las compras con factura completa (10 % + 5 %). */
  creditoFiscal: number;
  /** Débito − crédito: positivo = IVA a pagar; negativo = saldo a favor. */
  saldo: number;
};

export function resumirIva(
  ventas: FilaLibroVentas[],
  compras: FilaLibroCompras[],
  facturasAnuladas: number,
  comprasSinComprobante: number
): ResumenIva {
  const completas = compras.filter((c) => c.faltan.length === 0);
  const incompletas = compras.filter((c) => c.faltan.length > 0);
  const tv = totalizar(ventas);
  const tc = totalizar(completas);
  const debitoFiscal = tv.iva10 + tv.iva5;
  const creditoFiscal = tc.iva10 + tc.iva5;
  return {
    ventas: tv,
    facturasAnuladas,
    compras: tc,
    comprasIncompletas: totalizar(incompletas),
    comprasSinComprobante,
    debitoFiscal,
    creditoFiscal,
    saldo: debitoFiscal - creditoFiscal,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
//  Fechas y secciones de Contabilidad
// ---------------------------------------------------------------------------------------------------------------------

/**
 * "26/10/2026". Las facturas son un instante (su día es el de Asunción: `zona` "America/Asuncion"); la fecha de una compra o de un
 * gasto es el día elegido guardado a medianoche UTC (su día es el UTC: `zona` "UTC").
 */
export function fechaDelLibro(fecha: Date, zona: string): string {
  const partes = new Intl.DateTimeFormat("es-PY", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: zona }).formatToParts(fecha);
  const de = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "";
  return `${de("day")}/${de("month")}/${de("year")}`;
}

export type ReporteContable = "libro-ventas" | "libro-compras" | "resumen-iva" | "rg90";

export const REPORTES_CONTABLES: { valor: ReporteContable; titulo: string; bajada: string }[] = [
  {
    valor: "libro-ventas",
    titulo: "Libro IVA ventas",
    bajada: "Las facturas emitidas del período, con su IVA al 10 % y al 5 %: el libro de ventas que mira tu contador.",
  },
  {
    valor: "libro-compras",
    titulo: "Libro IVA compras",
    bajada: "Las facturas de tus proveedores y los gastos con factura del período, con el IVA que son crédito fiscal.",
  },
  {
    valor: "resumen-iva",
    titulo: "Resumen del IVA del mes",
    bajada: "El IVA de las ventas (débito) menos el IVA de las compras (crédito): lo que sale a pagar o queda a favor, de referencia.",
  },
  {
    valor: "rg90",
    titulo: "Registro RG 90 (Marangatú)",
    bajada: "El archivo de ventas y compras del mes en el formato de importación de la DNIT, listo para subir a Marangatú.",
  },
];

export function leerReporteContable(texto: string | undefined): ReporteContable | null {
  return REPORTES_CONTABLES.find((r) => r.valor === texto)?.valor ?? null;
}
