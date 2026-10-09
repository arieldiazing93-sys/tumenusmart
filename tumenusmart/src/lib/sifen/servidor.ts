/**
 * La facturación electrónica del lado del servidor: la bóveda del certificado, la configuración (ambiente y código de
 * seguridad CSC) y la firma de los documentos. Une las piezas puras de esta carpeta con la base de datos.
 *
 * Solo para el servidor (usa Prisma, node-forge y la clave maestra del entorno).
 *
 * Seguridad:
 *  - La clave privada del certificado y el CSC se guardan cifrados (AES-256-GCM) con la clave maestra de la variable de
 *    entorno CERTIFICADOS_CLAVE, atados al local: copiar el texto cifrado a otro local no lo descifra.
 *  - Si la clave maestra no está configurada, TODO lo que necesita un secreto se niega (no hay modo "sin cifrar").
 *  - La contraseña del .p12 se usa una vez y se descarta; nada de lo secreto va a la bitácora ni a los mensajes de error.
 *  - Toda lectura y escritura lleva el local explícito: un negocio nunca ve el certificado ni los documentos de otro.
 */

import { prisma } from "../prisma";
import { prismaDelLocal, type PrismaLocal } from "../prisma-local";
import { emisorDesdeFila, faltantesEmisor } from "../emisor-fiscal";
import { separarRuc } from "../sifen-codigos";
import type { ComprobanteParaDocumento, PagoParaDocumento } from "../documento-electronico";
import { armarDE, type ResultadoDE } from "./armar-de";
import { cifrarSecreto, descifrarSecreto, leerCertificadoP12 } from "./certificado";
import { deBase64, firmarDocumento, pemADer, verificarFirmaXml, type MaterialFirma } from "./firma";

export type Ambiente = "pruebas" | "produccion";

export const MENSAJE_SIN_BOVEDA =
  "El servidor todavía no tiene configurada la clave que protege los certificados (variable CERTIFICADOS_CLAVE). Sin ella no se puede guardar ni usar un certificado.";

/** La clave maestra de la bóveda (32 bytes en base64), o null si falta o no es válida. */
export function claveMaestra(): string | null {
  const valor = process.env.CERTIFICADOS_CLAVE?.trim();
  if (!valor) return null;
  try {
    return deBase64(valor).length === 32 ? valor : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
//  Estado
// ---------------------------------------------------------------------------

export type CertificadoResumen = {
  id: string;
  sujeto: string;
  emisor: string;
  ruc: string | null;
  dv: string | null;
  validoDesde: Date;
  validoHasta: Date;
  huellaSha256: string;
  bitsClave: number;
  usoAutenticacionCliente: boolean | null;
  avisos: string[];
  vencido: boolean;
  diasParaVencer: number;
  subidoPor: string;
  createdAt: Date;
};

export type EstadoFacturacionElectronica = {
  boveda: boolean;
  emisorFaltantes: string[];
  certificado: CertificadoResumen | null;
  ambiente: Ambiente;
  idCsc: string | null;
  tieneCsc: boolean;
  /** Lo que falta para poder firmar (vacío = listo). */
  falta: string[];
};

const textos = (json: unknown): string[] => (Array.isArray(json) ? json.filter((x): x is string => typeof x === "string") : []);

export async function estadoFacturacionElectronica(storeId: string): Promise<EstadoFacturacionElectronica> {
  const db = prismaDelLocal(storeId);
  const [emisorFila, certificado, config] = await Promise.all([
    db.emisorFiscal.findFirst({}),
    db.certificadoFirma.findFirst({ where: { activo: true }, orderBy: { createdAt: "desc" } }),
    db.configFacturacionElectronica.findFirst({}),
  ]);

  const emisorFaltantes = faltantesEmisor(emisorDesdeFila(emisorFila));
  const ahora = Date.now();
  const resumen: CertificadoResumen | null = certificado
    ? {
        id: certificado.id,
        sujeto: certificado.sujeto,
        emisor: certificado.emisor,
        ruc: certificado.ruc,
        dv: certificado.dv,
        validoDesde: certificado.validoDesde,
        validoHasta: certificado.validoHasta,
        huellaSha256: certificado.huellaSha256,
        bitsClave: certificado.bitsClave,
        usoAutenticacionCliente: certificado.usoAutenticacionCliente,
        avisos: textos(certificado.avisos),
        vencido: certificado.validoHasta.getTime() < ahora,
        diasParaVencer: Math.floor((certificado.validoHasta.getTime() - ahora) / 86_400_000),
        subidoPor: certificado.subidoPor,
        createdAt: certificado.createdAt,
      }
    : null;

  const boveda = claveMaestra() !== null;
  const ambiente: Ambiente = config?.ambiente === "produccion" ? "produccion" : "pruebas";
  const tieneCsc = Boolean(config?.cscCifrado && config.idCsc);

  const falta: string[] = [];
  if (!boveda) falta.push("La clave de la bóveda del servidor (CERTIFICADOS_CLAVE)");
  if (emisorFaltantes.length > 0) falta.push("Los datos del emisor (Puntos de expedición → Datos para factura electrónica)");
  if (!resumen) falta.push("El certificado digital del contribuyente");
  else if (resumen.vencido) falta.push("Un certificado vigente (el cargado está vencido)");
  if (!tieneCsc) falta.push("El código de seguridad del contribuyente (CSC)");

  return { boveda, emisorFaltantes, certificado: resumen, ambiente, idCsc: config?.idCsc ?? null, tieneCsc, falta };
}

// ---------------------------------------------------------------------------
//  Certificado
// ---------------------------------------------------------------------------

export type QuienFirma = { email: string; nombre?: string | null };

export type ResultadoGuardarCertificado = { ok: true; avisos: string[]; huellaSha256: string; ruc: string | null; validoHasta: Date } | { ok: false; error: string };

/**
 * Abre el .p12, lo revisa y lo guarda en la bóveda (la clave privada, cifrada). El certificado anterior queda de registro
 * SIN su clave. Un certificado vencido, que todavía no rige o sin permiso de firma digital se rechaza.
 */
export async function guardarCertificado(storeId: string, pfxBase64: string, clavePfx: string, quien: QuienFirma): Promise<ResultadoGuardarCertificado> {
  const maestra = claveMaestra();
  if (!maestra) return { ok: false, error: MENSAJE_SIN_BOVEDA };

  const leido = leerCertificadoP12(pfxBase64, clavePfx);
  if (!leido.ok) return leido;
  const c = leido.certificado;

  const ahora = Date.now();
  if (c.validoHasta.getTime() < ahora) return { ok: false, error: `El certificado está vencido (venció el ${c.validoHasta.toLocaleDateString("es-PY")}).` };
  if (c.validoDesde.getTime() > ahora) return { ok: false, error: `El certificado todavía no está vigente (rige desde el ${c.validoDesde.toLocaleDateString("es-PY")}).` };
  if (!c.usoFirmaDigital) return { ok: false, error: "El certificado no tiene permitido el uso de firma digital: no sirve para firmar facturas." };

  const avisos = [...c.avisos];
  // El RUC del certificado tiene que ser el del contribuyente que factura: se compara con los puntos de expedición cargados.
  const puntos = await prisma.puntoExpedicion.findMany({ where: { storeId }, select: { rucEmisor: true } });
  const rucsDelLocal = [...new Set(puntos.map((p) => separarRuc(p.rucEmisor).numero).filter(Boolean))];
  if (c.ruc && rucsDelLocal.length > 0 && !rucsDelLocal.includes(c.ruc)) {
    avisos.push(`El RUC del certificado (${c.ruc}) no coincide con el RUC cargado en los puntos de expedición (${rucsDelLocal.join(", ")}): la DNIT rechazaría la firma.`);
  }

  const cifrada = await cifrarSecreto(c.clavePrivadaPem, maestra, storeId);
  await prisma.$transaction([
    prisma.certificadoFirma.updateMany({ where: { storeId, activo: true }, data: { activo: false, clavePrivadaCifrada: null } }),
    prisma.certificadoFirma.create({
      data: {
        storeId,
        activo: true,
        sujeto: c.sujeto,
        emisor: c.emisor,
        ruc: c.ruc,
        dv: c.dv,
        validoDesde: c.validoDesde,
        validoHasta: c.validoHasta,
        huellaSha256: c.huellaSha256,
        bitsClave: c.bitsClave,
        usoFirmaDigital: c.usoFirmaDigital,
        usoAutenticacionCliente: c.usoAutenticacionCliente,
        avisos,
        certificadoBase64: c.certificadoBase64,
        cadenaPem: c.cadenaPem,
        clavePrivadaCifrada: cifrada,
        subidoPor: quien.nombre?.trim() || quien.email,
      },
    }),
  ]);
  return { ok: true, avisos, huellaSha256: c.huellaSha256, ruc: c.ruc, validoHasta: c.validoHasta };
}

/** Saca el certificado activo: queda de registro, sin su clave privada. */
export async function quitarCertificado(storeId: string): Promise<number> {
  const r = await prisma.certificadoFirma.updateMany({ where: { storeId, activo: true }, data: { activo: false, clavePrivadaCifrada: null } });
  return r.count;
}

// ---------------------------------------------------------------------------
//  Configuración (ambiente y CSC)
// ---------------------------------------------------------------------------

export type EntradaConfig = { ambiente: string; idCsc: string; csc: string };
export type ResultadoConfig = { ok: true } | { ok: false; error: string };

export async function guardarConfiguracion(storeId: string, entrada: EntradaConfig): Promise<ResultadoConfig> {
  const ambiente: Ambiente | null = entrada.ambiente === "produccion" ? "produccion" : entrada.ambiente === "pruebas" ? "pruebas" : null;
  if (!ambiente) return { ok: false, error: "Elegí el ambiente: pruebas o producción." };
  const idCsc = entrada.idCsc.trim();
  const csc = entrada.csc.trim();
  if (idCsc !== "" && !/^\d{4}$/.test(idCsc)) return { ok: false, error: "El identificador del CSC tiene que ser de 4 dígitos (por ejemplo 0001)." };
  if (csc !== "" && !/^[A-Za-z0-9]{32}$/.test(csc)) return { ok: false, error: "El CSC tiene que tener 32 letras o números, tal como lo entrega la DNIT." };

  const actual = await prisma.configFacturacionElectronica.findUnique({ where: { storeId } });
  let cscCifrado = actual?.cscCifrado ?? null;
  if (csc !== "") {
    const maestra = claveMaestra();
    if (!maestra) return { ok: false, error: MENSAJE_SIN_BOVEDA };
    cscCifrado = await cifrarSecreto(csc, maestra, storeId);
  }
  const idFinal = idCsc !== "" ? idCsc : (actual?.idCsc ?? null);
  if (cscCifrado && !idFinal) return { ok: false, error: "Falta el identificador del CSC (4 dígitos)." };
  if (idFinal && !cscCifrado) return { ok: false, error: "Falta el CSC (32 caracteres)." };

  await prisma.configFacturacionElectronica.upsert({
    where: { storeId },
    create: { storeId, ambiente, idCsc: idFinal, cscCifrado },
    update: { ambiente, idCsc: idFinal, cscCifrado },
  });
  return { ok: true };
}

// ---------------------------------------------------------------------------
//  Firmar un comprobante
// ---------------------------------------------------------------------------

/** El comprobante vigente de una factura con sus líneas (el más nuevo: si hubo remisión, el vigente). */
async function leerComprobante(db: PrismaLocal, origen: "pedido" | "venta", id: string) {
  return db.comprobante.findFirst({
    where: origen === "venta" ? { ventaPosId: id } : { orderId: id },
    orderBy: { createdAt: "desc" },
    include: { items: { orderBy: { orden: "asc" } } },
  });
}

type ComprobanteConItems = NonNullable<Awaited<ReturnType<typeof leerComprobante>>>;

export function comprobanteParaDocumento(c: ComprobanteConItems): ComprobanteParaDocumento {
  return {
    tipo: c.tipo,
    modalidad: c.modalidad,
    tipoEmision: c.tipoEmision,
    timbrado: c.timbrado,
    timbradoDesde: c.timbradoDesde,
    establecimiento: c.establecimiento,
    punto: c.punto,
    correlativo: c.correlativo,
    numero: c.numero,
    fechaEmision: c.fechaEmision,
    tipoTransaccion: c.tipoTransaccion,
    moneda: c.moneda,
    emisorRuc: c.emisorRuc,
    emisorRazonSocial: c.emisorRazonSocial,
    emisorDatos: c.emisorDatos,
    receptorTipoIdentificacion: c.receptorTipoIdentificacion,
    receptorNumeroIdentificacion: c.receptorNumeroIdentificacion,
    receptorRazonSocial: c.receptorRazonSocial,
    receptorEmail: c.receptorEmail,
    presencia: c.presencia,
    condicion: c.condicion,
    fechaVencimientoCredito: c.fechaVencimientoCredito,
    total: Number(c.total),
    items: [...c.items]
      .sort((a, b) => a.orden - b.orden)
      .map((i) => ({
        codigo: i.codigo,
        descripcion: i.descripcion,
        unidadMedida: i.unidadMedida,
        cantidad: Number(i.cantidad),
        precioUnitario: Number(i.precioUnitario),
        descuento: Number(i.descuento),
        total: Number(i.total),
        iva: i.iva,
      })),
  };
}

export type FacturaCargada = { comprobante: ComprobanteConItems; datos: ComprobanteParaDocumento; pagos: PagoParaDocumento[] };

/**
 * Lee el comprobante vigente de una factura (el más nuevo: si hubo remisión, el vigente) y cómo se pagó. `origen` dice si
 * `id` es de una venta del mostrador ("venta") o de un pedido ("pedido").
 */
export async function cargarFactura(db: PrismaLocal, origen: "pedido" | "venta", id: string): Promise<FacturaCargada | null> {
  const comprobante = await leerComprobante(db, origen, id);
  if (!comprobante) return null;

  let pagos: PagoParaDocumento[] = [];
  if (origen === "venta") {
    const filas = await db.pagoVenta.findMany({ where: { ventaPosId: id }, orderBy: { orden: "asc" }, select: { forma: true, monto: true } });
    pagos = filas.map((p) => ({ forma: p.forma, monto: Number(p.monto) }));
  } else {
    const pedido = await db.order.findUnique({ where: { id }, select: { cobroMetodo: true, formaPagoPos: true } });
    const forma = pedido?.cobroMetodo ?? pedido?.formaPagoPos ?? null;
    pagos = forma ? [{ forma, monto: Number(comprobante.total) }] : [];
  }
  return { comprobante, datos: comprobanteParaDocumento(comprobante), pagos };
}

export type ResultadoFirmar =
  | { ok: true; documentoId: string; cdc: string; vistaPrevia: boolean; ambiente: Ambiente; avisos: string[] }
  | { ok: false; error: string; faltantes?: string[] };

type MaterialCargado = { material: MaterialFirma; huella: string; csc: string; idCsc: string; ambiente: Ambiente };

/** Descifra lo necesario para firmar. Devuelve un texto claro si falta algo. */
async function cargarMaterial(storeId: string): Promise<{ ok: true; datos: MaterialCargado } | { ok: false; error: string }> {
  const maestra = claveMaestra();
  if (!maestra) return { ok: false, error: MENSAJE_SIN_BOVEDA };
  const [certificado, config] = await Promise.all([
    prisma.certificadoFirma.findFirst({ where: { storeId, activo: true }, orderBy: { createdAt: "desc" } }),
    prisma.configFacturacionElectronica.findUnique({ where: { storeId } }),
  ]);
  if (!certificado || !certificado.clavePrivadaCifrada) return { ok: false, error: "Todavía no hay un certificado digital cargado." };
  if (certificado.validoHasta.getTime() < Date.now()) return { ok: false, error: "El certificado digital está vencido: cargá uno vigente." };
  if (!config?.cscCifrado || !config.idCsc) return { ok: false, error: "Todavía no está cargado el código de seguridad (CSC)." };
  try {
    const pem = await descifrarSecreto(certificado.clavePrivadaCifrada, maestra, storeId);
    const csc = await descifrarSecreto(config.cscCifrado, maestra, storeId);
    return {
      ok: true,
      datos: {
        material: { clavePrivadaPkcs8: pemADer(pem), certificadoBase64: certificado.certificadoBase64 },
        huella: certificado.huellaSha256,
        csc,
        idCsc: config.idCsc,
        ambiente: config.ambiente === "produccion" ? "produccion" : "pruebas",
      },
    };
  } catch {
    // Clave maestra distinta de la que cifró, o datos alterados: no se dice más.
    return { ok: false, error: "No se pudo abrir el certificado guardado. Volvé a cargarlo (puede haber cambiado la clave del servidor)." };
  }
}

/**
 * Arma, firma y guarda el documento electrónico de una factura. Si la factura salió como autoimpresor es solo una "vista
 * previa firmada" (`vistaPrevia`): sirve para probar la firma y el KuDE, y nunca se envía a la DNIT. Un documento ya
 * enviado no se vuelve a firmar.
 */
export async function firmarFactura(storeId: string, origen: "pedido" | "venta", id: string, quien: QuienFirma): Promise<ResultadoFirmar> {
  const db = prismaDelLocal(storeId);
  const factura = await cargarFactura(db, origen, id);
  if (!factura) return { ok: false, error: "Esta factura es anterior a los comprobantes y no tiene su registro completo." };
  if (factura.comprobante.estado === "anulado") return { ok: false, error: "La factura está anulada: no se firma." };

  const existente = await db.documentoElectronico.findFirst({ where: { comprobanteId: factura.comprobante.id } });
  if (existente && existente.estado !== "firmado") {
    return { ok: false, error: "Este documento ya fue enviado a la DNIT: no se puede firmar de nuevo." };
  }

  const cargado = await cargarMaterial(storeId);
  if (!cargado.ok) return cargado;
  const { material, huella, csc, idCsc, ambiente } = cargado.datos;

  const armado: ResultadoDE = armarDE(factura.datos, factura.pagos, { ambiente, fechaFirma: new Date() });
  if (!armado.de || !armado.cdc || armado.faltantes.length > 0) {
    return { ok: false, error: "Faltan datos para armar el documento.", faltantes: armado.faltantes };
  }

  let firmado;
  try {
    firmado = await firmarDocumento(armado.de, material, { csc, idCsc, produccion: ambiente === "produccion" });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo firmar el documento." };
  }
  // Autocontrol: lo que se guarda tiene que verificar con el certificado que lo firmó.
  const control = await verificarFirmaXml(firmado.xml);
  if (!control.valida) return { ok: false, error: `La firma no pasó el autocontrol: ${control.motivo}` };

  const vistaPrevia = factura.comprobante.modalidad !== "electronico";
  const datos = {
    cdc: firmado.cdc,
    ambiente,
    vistaPrevia,
    estado: "firmado",
    xmlFirmado: firmado.xml,
    digestValue: firmado.digestValue,
    urlQr: firmado.urlQr,
    huellaCertificado: huella,
    firmadoEn: new Date(),
    firmadoPor: quien.nombre?.trim() || quien.email,
  };
  const guardado = existente
    ? await prisma.documentoElectronico.update({ where: { id: existente.id }, data: datos })
    : await prisma.documentoElectronico.create({ data: { ...datos, storeId, comprobanteId: factura.comprobante.id } });

  return { ok: true, documentoId: guardado.id, cdc: firmado.cdc, vistaPrevia, ambiente, avisos: armado.avisos };
}

// ---------------------------------------------------------------------------
//  Consultar documentos firmados
// ---------------------------------------------------------------------------

export type DocumentoResumen = {
  id: string;
  cdc: string;
  ambiente: string;
  vistaPrevia: boolean;
  estado: string;
  firmadoEn: Date;
  numero: string;
  total: number;
};

export async function listarDocumentos(storeId: string, limite = 20): Promise<DocumentoResumen[]> {
  const filas = await prisma.documentoElectronico.findMany({
    where: { storeId },
    orderBy: { firmadoEn: "desc" },
    take: limite,
    select: { id: true, cdc: true, ambiente: true, vistaPrevia: true, estado: true, firmadoEn: true, comprobante: { select: { numero: true, total: true } } },
  });
  return filas.map((f) => ({
    id: f.id,
    cdc: f.cdc,
    ambiente: f.ambiente,
    vistaPrevia: f.vistaPrevia,
    estado: f.estado,
    firmadoEn: f.firmadoEn,
    numero: f.comprobante.numero,
    total: Number(f.comprobante.total),
  }));
}

/** El documento firmado de un local (null si no existe o es de otro local). */
export async function obtenerDocumentoFirmado(storeId: string, id: string) {
  return prisma.documentoElectronico.findFirst({ where: { id, storeId } });
}
