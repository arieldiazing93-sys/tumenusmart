import type { PrismaLocal } from "./prisma-local";
import { formatearCantidad, formatearGuarani, formatearMiles, formatearTelefonoLocal, sinAcentos } from "./format";
import { numeroALetras } from "./numero-a-letras";
import { textoPorcentaje } from "./descuento-venta";
import { SIN_REGISTRO_FISCAL, etiquetaTipoIdentificacion } from "./tipo-cliente";
import { ZONA_NEGOCIO } from "./timezone";
import { centrado, filaEtiqueta, filaTabla, separador } from "./escpos";

/**
 * Las líneas de texto de la FACTURA de una cuenta de delivery emitida con la "factura rápida" (antes de cobrar, cuando todavía no hay
 * una venta registrada). Mismo contenido y mismo orden que la factura de una venta (pos/venta/[id]/ticket), pero armado desde el
 * comprobante: no lleva "método de pago" porque todavía no se cobró. Las usan la ruta que se manda a la impresora (texto crudo) y la
 * página para verla o imprimirla desde el navegador.
 *
 * Devuelve null si la cuenta no tiene una factura vigente.
 */
export async function lineasDeFacturaDeCuenta(db: PrismaLocal, storeId: string, cuentaId: string): Promise<string[] | null> {
  const [comprobante, store, cuenta] = await Promise.all([
    db.comprobante.findFirst({
      where: { cuentaDeliveryId: cuentaId, estado: "vigente" },
      orderBy: { createdAt: "desc" },
      include: { items: { orderBy: { orden: "asc" } } },
    }),
    db.store.findUnique({ where: { id: storeId }, select: { nombre: true, direccion: true, whatsappNumero: true } }),
    db.cuentaDelivery.findFirst({ where: { id: cuentaId }, select: { descuentoTipo: true, descuentoValor: true } }),
  ]);
  if (!comprobante) return null;

  const sep = () => separador("=");
  const fechaFactura = comprobante.fechaEmision.toLocaleString("es-PY", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: ZONA_NEGOCIO,
  });

  const l: string[] = [];
  l.push(sep());
  l.push(centrado(sinAcentos(store?.nombre ?? "Comprobante").toUpperCase()));
  if (store?.direccion) l.push(centrado(sinAcentos(store.direccion)));
  if (store?.whatsappNumero) l.push(centrado(`Tel: ${formatearTelefonoLocal(store.whatsappNumero)}`));
  l.push(sep());

  l.push(centrado("FACTURA"));
  l.push(`Razon social: ${sinAcentos(comprobante.emisorRazonSocial)}`);
  l.push(`RUC: ${comprobante.emisorRuc}`);
  l.push(`Timbrado: ${comprobante.timbrado}  Vto: ${comprobante.timbradoHasta.toLocaleDateString("es-PY", { timeZone: ZONA_NEGOCIO })}`);
  l.push(`Factura: ${comprobante.numero}`);
  l.push(`Condicion de venta: ${comprobante.condicion === "credito" ? "CREDITO" : "CONTADO"}`);
  l.push(`Fecha: ${fechaFactura}`);
  l.push(sep());

  const esSinNombre = comprobante.receptorTipoIdentificacion === SIN_REGISTRO_FISCAL.tipo;
  l.push(`Razon social: ${esSinNombre ? SIN_REGISTRO_FISCAL.etiquetaDisplay : sinAcentos(comprobante.receptorRazonSocial ?? "")}`);
  l.push(
    `${esSinNombre ? "RUC" : sinAcentos(etiquetaTipoIdentificacion(comprobante.receptorTipoIdentificacion))}: ${comprobante.receptorNumeroIdentificacion}`
  );
  l.push(sep());

  l.push(filaTabla("Ctd", "Descripcion", "Importe"));
  for (const item of comprobante.items) {
    // Cada línea a precio de lista (el descuento general va aparte, abajo): lo mismo que en la factura de una venta.
    const cantidad = Number(item.cantidad);
    l.push(filaTabla(formatearCantidad(cantidad), sinAcentos(item.descripcion), formatearMiles(cantidad * Number(item.precioUnitario))));
  }
  l.push(sep());

  const total = Number(comprobante.total);
  const descuento = Number(comprobante.descuento);
  if (descuento > 0) {
    const porcentaje = cuenta?.descuentoTipo === "porcentaje" && cuenta.descuentoValor != null ? Number(cuenta.descuentoValor) : null;
    l.push(`SUBTOTAL: ${formatearGuarani(total + descuento)}`);
    l.push(`${porcentaje != null ? `DESCUENTO ${textoPorcentaje(porcentaje)}%` : "DESCUENTO"}: -${formatearGuarani(descuento)}`);
  }
  l.push(`TOTAL: ${formatearGuarani(total)}`);
  l.push(`SON: ${numeroALetras(total)} GUARANIES`);
  l.push(sep());

  l.push("DETALLE FISCAL");
  if (Number(comprobante.gravado10) > 0) l.push(filaEtiqueta("GRAVADAS 10%", formatearGuarani(Number(comprobante.gravado10)), 12));
  if (Number(comprobante.gravado5) > 0) l.push(filaEtiqueta("GRAVADAS 5%", formatearGuarani(Number(comprobante.gravado5)), 12));
  if (Number(comprobante.exento) > 0) l.push(filaEtiqueta("EXENTAS", formatearGuarani(Number(comprobante.exento)), 12));
  l.push(sep());
  l.push("LIQUIDACION IVA");
  if (Number(comprobante.iva10) > 0) l.push(filaEtiqueta("IVA 10%", formatearGuarani(Number(comprobante.iva10)), 9));
  if (Number(comprobante.iva5) > 0) l.push(filaEtiqueta("IVA 5%", formatearGuarani(Number(comprobante.iva5)), 9));
  // La suma de lo que se imprimió arriba (cada tasa ya redondeada a guaraníes).
  l.push(filaEtiqueta("TOTAL IVA", formatearGuarani(Math.round(Number(comprobante.iva10)) + Math.round(Number(comprobante.iva5))), 9));
  l.push(sep());
  l.push("ORIGINAL: CLIENTE");
  l.push("DUPLICADO: ARCHIVO TRIBUTARIO");
  l.push(centrado("Gracias por su compra!"));
  l.push(centrado("Documento valido como Factura Autoimpresor."));
  l.push(sep());
  return l;
}
