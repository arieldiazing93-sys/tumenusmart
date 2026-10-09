/**
 * El KuDE: la representación gráfica (impresa o en pantalla) de una factura electrónica.
 *
 * Fuente: Manual Técnico SIFEN v150, capítulo 13, con la Nota Técnica 10 (formatos de fecha). Reglas que cumple:
 *  - Lleva el encabezado (emisor, timbrado, fecha de emisión, condición, moneda, receptor, tipo de operación), el detalle
 *    de ítems (código, descripción, unidad, cantidad, precio, descuento y valor de venta en exentas / 5 % / 10 %), los
 *    subtotales, el total, la liquidación del IVA, el CDC en grupos de cuatro (once grupos), la dirección de consulta y el
 *    código QR (13.4, 10.1 y 13.8).
 *  - "No puede existir información en el KuDE que no forme parte del formato del DE firmado" (13.2): por eso el modelo
 *    se arma LEYENDO el archivo firmado que se guardó, no los datos de la venta. Lo que se ve es lo que firmó el sistema.
 *  - Fechas: la de emisión con sus guiones (AAAA-MM-DDThh:mm:ss) y la de inicio del timbrado como DD-MM-AAAA (NT 10).
 *
 * Este módulo solo arma el modelo (texto ya listo para mostrar); cómo se dibuja está en el componente Kude.
 */

import { cdcParaMostrar } from "./cdc";
import { leerXmlRDE, type Nodo } from "./xml";

export type FilaKude = {
  codigo: string;
  descripcion: string;
  unidad: string;
  cantidad: string;
  precioUnitario: string;
  descuento: string;
  /** El valor de venta de la línea va en UNA de las tres columnas, según su IVA. */
  exentas: string;
  iva5: string;
  iva10: string;
};

export type ModeloKude = {
  /** "KuDE de Factura Electrónica" (13.3). */
  titulo: string;
  tipoDocumento: string;
  /** 001-001-0000047 */
  numero: string;
  timbrado: string;
  /** DD-MM-AAAA */
  inicioVigencia: string;
  emisor: {
    razonSocial: string;
    nombreFantasia: string | null;
    ruc: string;
    actividad: string | null;
    direccion: string;
    ciudad: string | null;
    telefono: string | null;
    email: string | null;
    sucursal: string | null;
  };
  /** AAAA-MM-DDThh:mm:ss */
  fechaEmision: string;
  condicion: string;
  /** "30 días", si es a crédito. */
  plazo: string | null;
  moneda: string;
  tipoOperacion: string | null;
  receptor: {
    /** "RUC" o el tipo de documento ("Cédula paraguaya"). */
    tipoDocumento: string;
    documento: string;
    nombre: string;
    direccion: string | null;
    telefono: string | null;
    email: string | null;
  };
  items: FilaKude[];
  totales: {
    subExentas: string;
    sub5: string;
    sub10: string;
    descuento: string;
    totalOperacion: string;
    totalGuaranies: string;
    liquidacion5: string;
    liquidacion10: string;
    totalIva: string;
  };
  /** Cómo se pagó (solo si es al contado): "Efectivo · 150.000". */
  pagos: { forma: string; monto: string }[];
  cdc: string;
  cdcAgrupado: string;
  /** La dirección que lleva el QR (para dibujarlo). */
  urlQr: string;
  /** La página de consulta pública según el ambiente del documento. */
  urlConsulta: string;
  /** True si el documento es del ambiente de pruebas: no tiene valor comercial ni fiscal. */
  esPrueba: boolean;
};

const guaranies = (valor: string | number | undefined | null): string => {
  const n = typeof valor === "number" ? valor : parseFloat(String(valor ?? "0"));
  if (!Number.isFinite(n)) return "0";
  return new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 }).format(Math.round(n));
};

/** Cantidades y precios con decimales solo si hacen falta, con coma. */
const cantidadTexto = (valor: string | undefined): string => {
  const n = parseFloat(valor ?? "0");
  if (!Number.isFinite(n)) return "0";
  const redondeado = Math.round(n * 10000) / 10000;
  return String(redondeado).replace(".", ",");
};

const nodo = (v: unknown): Nodo | undefined => (v && typeof v === "object" && !Array.isArray(v) ? (v as Nodo) : undefined);
const lista = (v: unknown): Nodo[] => (Array.isArray(v) ? (v as Nodo[]) : v && typeof v === "object" ? [v as Nodo] : []);
const texto = (n: Nodo | undefined, campo: string): string | null => {
  const v = n?.[campo];
  return typeof v === "string" && v.trim() !== "" ? v : null;
};

/** AAAA-MM-DD a DD-MM-AAAA (NT 10). */
function fechaInversa(fecha: string | null): string {
  const m = fecha ? /^(\d{4})-(\d{2})-(\d{2})/.exec(fecha) : null;
  return m ? `${m[3]}-${m[2]}-${m[1]}` : (fecha ?? "");
}

/**
 * Arma el KuDE de una factura electrónica a partir del archivo firmado (el <rDE> completo que se guardó). Lanza un error
 * con un texto claro si el archivo no es un documento válido.
 */
export function construirKude(xmlFirmado: string): ModeloKude {
  const rde = leerXmlRDE(xmlFirmado);
  const de = nodo(rde.DE);
  if (!de) throw new Error("El archivo no trae el documento (DE)");
  const timbrado = nodo(de.gTimb);
  const general = nodo(de.gDatGralOpe);
  const operacion = nodo(general?.gOpeCom);
  const emisor = nodo(general?.gEmis);
  const receptor = nodo(general?.gDatRec);
  const tipo = nodo(de.gDtipDE);
  const condicion = nodo(tipo?.gCamCond);
  const totales = nodo(de.gTotSub);
  const fuenteQr = nodo(rde.gCamFuFD);
  if (!timbrado || !general || !emisor || !receptor || !tipo || !totales) throw new Error("El documento está incompleto: no se puede armar el KuDE");

  const cdc = String(de["@Id"] ?? "");
  const urlQr = texto(fuenteQr, "dCarQR") ?? "";
  const esPrueba = urlQr.includes("/consultas-test/");

  const items: FilaKude[] = lista(tipo.gCamItem).map((it) => {
    const valor = nodo(it.gValorItem);
    const resta = nodo(valor?.gValorRestaItem);
    const iva = nodo(it.gCamIVA);
    const bruto = parseFloat(texto(valor, "dTotBruOpeItem") ?? "0");
    const venta = parseFloat(texto(resta, "dTotOpeItem") ?? "0");
    const afectacion = texto(iva, "iAfecIVA");
    const tasa = texto(iva, "dTasaIVA");
    const exento = afectacion !== "1" && afectacion !== "4";
    return {
      codigo: texto(it, "dCodInt") ?? "",
      descripcion: texto(it, "dDesProSer") ?? "",
      unidad: texto(it, "dDesUniMed") ?? "",
      cantidad: cantidadTexto(texto(it, "dCantProSer") ?? "0"),
      precioUnitario: guaranies(texto(valor, "dPUniProSer")),
      descuento: guaranies(Math.max(0, bruto - venta)),
      exentas: exento ? guaranies(venta) : "0",
      iva5: !exento && tasa === "5" ? guaranies(venta) : "0",
      iva10: !exento && tasa === "10" ? guaranies(venta) : "0",
    };
  });

  const ruc = texto(receptor, "dRucRec");
  const direccionEmisor = [texto(emisor, "dDirEmi"), texto(emisor, "dNumCas") && texto(emisor, "dNumCas") !== "0" ? `N° ${texto(emisor, "dNumCas")}` : null, texto(emisor, "dCompDir1")]
    .filter(Boolean)
    .join(" ");
  const actividades = lista(emisor.gActEco);

  return {
    titulo: "KuDE de Factura Electrónica",
    tipoDocumento: texto(timbrado, "dDesTiDE") ?? "Factura electrónica",
    numero: `${texto(timbrado, "dEst") ?? "000"}-${texto(timbrado, "dPunExp") ?? "000"}-${texto(timbrado, "dNumDoc") ?? "0000000"}`,
    timbrado: texto(timbrado, "dNumTim") ?? "",
    inicioVigencia: fechaInversa(texto(timbrado, "dFeIniT")),
    emisor: {
      razonSocial: texto(emisor, "dNomEmi") ?? "",
      nombreFantasia: texto(emisor, "dNomFanEmi"),
      ruc: `${texto(emisor, "dRucEm") ?? ""}-${texto(emisor, "dDVEmi") ?? ""}`,
      actividad: actividades.length > 0 ? texto(actividades[0], "dDesActEco") : null,
      direccion: direccionEmisor,
      ciudad: texto(emisor, "dDesCiuEmi"),
      telefono: texto(emisor, "dTelEmi"),
      email: texto(emisor, "dEmailE"),
      sucursal: texto(emisor, "dDenSuc"),
    },
    fechaEmision: texto(general, "dFeEmiDE") ?? "",
    condicion: texto(condicion, "dDCondOpe") ?? "",
    plazo: texto(nodo(condicion?.gPagCred), "dPlazoCre"),
    moneda: texto(operacion, "dDesMoneOpe") ?? "Guarani",
    tipoOperacion: texto(operacion, "dDesTipTra"),
    receptor: {
      tipoDocumento: ruc ? "RUC" : (texto(receptor, "dDTipIDRec") ?? "Documento"),
      documento: ruc ? `${ruc}-${texto(receptor, "dDVRec") ?? ""}` : (texto(receptor, "dNumIDRec") ?? ""),
      nombre: texto(receptor, "dNomRec") ?? "",
      direccion: texto(receptor, "dDirRec"),
      telefono: texto(receptor, "dTelRec") ?? texto(receptor, "dCelRec"),
      email: texto(receptor, "dEmailRec"),
    },
    items,
    totales: {
      subExentas: guaranies(texto(totales, "dSubExe")),
      sub5: guaranies(texto(totales, "dSub5")),
      sub10: guaranies(texto(totales, "dSub10")),
      descuento: guaranies(texto(totales, "dDescTotal")),
      totalOperacion: guaranies(texto(totales, "dTotOpe")),
      totalGuaranies: guaranies(texto(totales, "dTotalGs") ?? texto(totales, "dTotGralOpe")),
      liquidacion5: guaranies(texto(totales, "dLiqTotIVA5")),
      liquidacion10: guaranies(texto(totales, "dLiqTotIVA10")),
      totalIva: guaranies(texto(totales, "dTotIVA")),
    },
    pagos: lista(condicion?.gPaConEIni).map((p) => ({ forma: texto(p, "dDesTiPag") ?? "", monto: guaranies(texto(p, "dMonTiPag")) })),
    cdc,
    cdcAgrupado: cdcParaMostrar(cdc),
    urlQr,
    urlConsulta: esPrueba ? "https://ekuatia.set.gov.py/consultas-test/" : "https://ekuatia.set.gov.py/consultas/",
    esPrueba,
  };
}
