import { NextResponse } from "next/server";
import { pantallaConPermiso } from "@/lib/auth";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { formatearGuarani, formatearMiles, formatearNumero, formatearTelefonoLocal, sinAcentos } from "@/lib/format";
import { numeroALetras } from "@/lib/numero-a-letras";
import { etiquetaFormaPagoPos } from "@/lib/turno-pos";
import { SIN_REGISTRO_FISCAL, etiquetaTipoIdentificacion } from "@/lib/tipo-cliente";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import { armarDocumento, centrado, filaEtiqueta, filaTabla, negrita, separador } from "@/lib/escpos";

export const dynamic = "force-dynamic";

/**
 * Versión en texto plano (ESC/POS crudo) del ticket/factura del POS, para
 * QZ Tray — mismo contenido y mismo orden que la página HTML
 * (`../page.tsx`, que sigue existiendo para ver/imprimir a mano desde el
 * navegador), pero como texto para una impresora "raw" en vez de HTML para
 * el driver gráfico.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await pantallaConPermiso("pos.vender");
  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);
  const { id } = await params;

  const [venta, store] = await Promise.all([
    db.ventaPos.findUnique({
      where: { id },
      include: {
        items: true,
        turnoPos: { include: { estacion: { include: { puntoExpedicion: true } } } },
      },
    }),
    db.store.findUnique({ where: { id: storeId } }),
  ]);

  if (!venta) return new NextResponse("No encontrado", { status: 404 });

  const puntoExpedicion = venta.turnoPos.estacion.puntoExpedicion;
  const esFactura = venta.comprobanteTipo === "factura";
  const sep = () => separador(esFactura ? "=" : "-");

  const fecha = venta.creadoEn.toLocaleString("es-PY", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    timeZone: ZONA_NEGOCIO,
  });
  const fechaFactura = venta.creadoEn.toLocaleString("es-PY", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit",
    timeZone: ZONA_NEGOCIO,
  });

  const l: string[] = [];

  if (venta.cancelada) {
    l.push(centrado(negrita("*** ANULADA ***")), "Venta cancelada - no es un comprobante valido.", "");
  }

  l.push(sep());
  l.push(centrado(sinAcentos(store?.nombre ?? "Comprobante").toUpperCase()));
  if (store?.direccion) l.push(centrado(sinAcentos(store.direccion)));
  if (store?.whatsappNumero) l.push(centrado(`Tel: ${formatearTelefonoLocal(store.whatsappNumero)}`));
  l.push(sep());

  if (esFactura) {
    l.push(centrado("FACTURA"));
    if (puntoExpedicion) {
      l.push(`Razon social: ${sinAcentos(puntoExpedicion.razonSocialEmisor)}`);
      l.push(`RUC: ${puntoExpedicion.rucEmisor}`);
      const vto = venta.facturaVencimiento
        ? `  Vto: ${venta.facturaVencimiento.toLocaleDateString("es-PY", { timeZone: ZONA_NEGOCIO })}`
        : "";
      l.push(`Timbrado: ${venta.facturaTimbrado}${vto}`);
    }
    l.push(`Factura: ${venta.facturaNumero}`);
    l.push("Condicion de venta: CONTADO");
    l.push(`Fecha: ${fechaFactura}`);
    l.push(`Metodo de pago: ${sinAcentos(etiquetaFormaPagoPos(venta.formaPago))}`);
  } else {
    l.push("Servicio rapido");
    l.push(fecha);
    l.push(`Venta ${formatearNumero(venta.numero)}`);
  }
  l.push(sep());

  if (esFactura) {
    const esSinNombre = venta.facturaTipoIdentificacion === SIN_REGISTRO_FISCAL.tipo;
    l.push(`Razon social: ${esSinNombre ? SIN_REGISTRO_FISCAL.etiquetaDisplay : sinAcentos(venta.facturaRazonSocial ?? "")}`);
    l.push(
      `${esSinNombre ? "RUC" : sinAcentos(etiquetaTipoIdentificacion(venta.facturaTipoIdentificacion ?? "ruc"))}: ${venta.facturaRuc}`
    );
    l.push(sep());
    l.push(filaTabla("Ctd", "Descripcion", "Importe"));
  }
  for (const item of venta.items) {
    l.push(filaTabla(String(item.cantidad), sinAcentos(item.nombreProducto), formatearMiles(item.cantidad * Number(item.precioUnitario))));
    if (item.opcionesTexto) l.push(`  + ${sinAcentos(item.opcionesTexto)}`);
  }
  l.push(sep());

  l.push(`TOTAL: ${formatearGuarani(Number(venta.total))}`);
  if (esFactura) l.push(`SON: ${numeroALetras(Number(venta.total))} GUARANIES`);
  l.push(sep());

  if (esFactura) {
    l.push("DETALLE FISCAL");
    if (Number(venta.facturaGravado10 ?? 0) > 0) l.push(filaEtiqueta("GRAVADAS 10%", formatearGuarani(Number(venta.facturaGravado10)), 12));
    if (Number(venta.facturaGravado5 ?? 0) > 0) l.push(filaEtiqueta("GRAVADAS 5%", formatearGuarani(Number(venta.facturaGravado5)), 12));
    if (Number(venta.facturaExento ?? 0) > 0) l.push(filaEtiqueta("EXENTAS", formatearGuarani(Number(venta.facturaExento)), 12));
    l.push(sep());
    l.push("LIQUIDACION IVA");
    if (Number(venta.facturaIva10 ?? 0) > 0) l.push(filaEtiqueta("IVA 10%", formatearGuarani(Number(venta.facturaIva10)), 9));
    if (Number(venta.facturaIva5 ?? 0) > 0) l.push(filaEtiqueta("IVA 5%", formatearGuarani(Number(venta.facturaIva5)), 9));
    l.push(filaEtiqueta("TOTAL IVA", formatearGuarani(Number(venta.facturaIva10 ?? 0) + Number(venta.facturaIva5 ?? 0)), 9));
    l.push(sep());
    l.push("ORIGINAL: CLIENTE");
    l.push("DUPLICADO: ARCHIVO TRIBUTARIO");
  } else {
    l.push(`Pago: ${sinAcentos(etiquetaFormaPagoPos(venta.formaPago))}`);
    l.push(sep());
  }

  l.push(centrado("Gracias por su compra!"));
  l.push(centrado(esFactura ? "Documento valido como Factura Autoimpresor." : "Este comprobante no es una factura legal."));
  l.push(sep());

  if (venta.cancelada) {
    l.push(centrado(negrita("*** ANULADA ***")));
    l.push("Venta cancelada - no es un comprobante valido.");
  }

  return new NextResponse(armarDocumento(l), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
