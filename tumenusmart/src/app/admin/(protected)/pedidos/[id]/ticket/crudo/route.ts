import { NextResponse } from "next/server";
import { pantallaConPermiso } from "@/lib/auth";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { formatearGuarani, formatearMiles, formatearNumero, formatearTelefonoLocal, sinAcentos } from "@/lib/format";
import { numeroALetras } from "@/lib/numero-a-letras";
import { etiquetaMetodoPago } from "@/lib/metodos-pago";
import { SIN_REGISTRO_FISCAL, etiquetaTipoIdentificacion } from "@/lib/tipo-cliente";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import { armarDocumento, centrado, filaEtiqueta, filaTabla, negrita, separador } from "@/lib/escpos";

export const dynamic = "force-dynamic";

/**
 * Versión en texto plano (ESC/POS crudo) del ticket/factura de pedidos,
 * para QZ Tray — mismo contenido y orden que la página HTML (`../page.tsx`).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await pantallaConPermiso("pedidos.ver");
  const storeId = await idLocalActual();
  const prisma = prismaDelLocal(storeId);
  const { id } = await params;

  const [pedido, store] = await Promise.all([
    prisma.order.findUnique({ where: { id }, include: { items: true, deliveryZone: true, repartidor: true } }),
    prisma.store.findUnique({ where: { id: storeId } }),
  ]);
  if (!pedido) return new NextResponse("No encontrado", { status: 404 });

  const esDelivery = pedido.tipoEntrega === "delivery";
  // Una factura anulada sola (cuenta viva) ya no cuenta como vigente para
  // imprimir — ver la misma nota en ../page.tsx.
  const esFactura = pedido.comprobanteTipo === "factura" && !!pedido.facturaNumero && !pedido.facturaAnulada;
  const esSinNombre = pedido.facturaTipoIdentificacion === SIN_REGISTRO_FISCAL.tipo;
  const esAnulado = pedido.estado === "cancelado";
  const sep = () => separador(esFactura ? "=" : "-");

  const fecha = new Date(pedido.createdAt).toLocaleString("es-PY", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: ZONA_NEGOCIO,
  });
  const fechaFactura = new Date(pedido.createdAt).toLocaleString("es-PY", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit",
    timeZone: ZONA_NEGOCIO,
  });

  const l: string[] = [];

  if (esAnulado) l.push(centrado(negrita("*** ANULADA ***")), "Pedido cancelado - no es un comprobante valido.", "");

  l.push(sep());
  l.push(centrado(sinAcentos(store?.nombre ?? "Comprobante").toUpperCase()));
  if (store?.direccion) l.push(centrado(sinAcentos(store.direccion)));
  if (store?.whatsappNumero) l.push(centrado(`Tel: ${formatearTelefonoLocal(store.whatsappNumero)}`));
  l.push(sep());

  if (esFactura) {
    l.push(centrado("FACTURA"));
    l.push(`Razon social: ${sinAcentos(pedido.facturaRazonSocialEmisor ?? "")}`);
    l.push(`RUC: ${pedido.facturaRucEmisor}`);
    const vto = pedido.facturaVencimiento
      ? `  Vto: ${pedido.facturaVencimiento.toLocaleDateString("es-PY", { timeZone: ZONA_NEGOCIO })}`
      : "";
    l.push(`Timbrado: ${pedido.facturaTimbrado}${vto}`);
    l.push(`Factura: ${pedido.facturaNumero}`);
    l.push("Condicion de venta: CONTADO");
    l.push(`Fecha: ${fechaFactura}`);
    l.push(`Metodo de pago: ${sinAcentos(etiquetaMetodoPago(pedido.metodoPagoReferencia))}`);
  } else {
    l.push(`Pedido ${formatearNumero(pedido.numero)}`);
    l.push(fecha);
    l.push(`Cliente: ${sinAcentos(pedido.clienteNombre)}`);
    l.push(`Tel: ${pedido.clienteTelefono}`);
  }

  if (pedido.comprobanteTipo === "factura") {
    l.push(sep());
    if (esFactura) {
      l.push(`Razon social: ${esSinNombre ? SIN_REGISTRO_FISCAL.etiquetaDisplay : sinAcentos(pedido.facturaRazonSocial ?? "")}`);
      l.push(`${esSinNombre ? "RUC" : sinAcentos(etiquetaTipoIdentificacion(pedido.facturaTipoIdentificacion ?? "ruc"))}: ${pedido.facturaRuc}`);
    } else {
      l.push("Datos para factura");
      if (pedido.facturaAnulada && pedido.facturaNumero) {
        l.push(`Factura ${pedido.facturaNumero} ANULADA - no vale como comprobante fiscal.`);
      }
      l.push(`Razon social: ${esSinNombre ? SIN_REGISTRO_FISCAL.etiquetaDisplay : sinAcentos(pedido.facturaRazonSocial ?? "")}`);
      l.push(`${esSinNombre ? "RUC" : sinAcentos(etiquetaTipoIdentificacion(pedido.facturaTipoIdentificacion ?? "ruc"))}: ${pedido.facturaRuc}`);
      if (pedido.facturaEmail) l.push(`Correo: ${pedido.facturaEmail}`);
    }
  }
  l.push(sep());

  if (esFactura) l.push(filaTabla("Ctd", "Descripcion", "Importe"));
  for (const item of pedido.items) {
    l.push(filaTabla(String(item.cantidad), sinAcentos(item.nombreProducto), formatearMiles(item.cantidad * Number(item.precioUnitario))));
    if (item.opcionesTexto) l.push(`  + ${sinAcentos(item.opcionesTexto)}`);
    if (item.ingredientesQuitadosTexto) l.push(`  ${sinAcentos(item.ingredientesQuitadosTexto)}`);
  }
  l.push(sep());

  l.push(`Subtotal: ${formatearGuarani(Number(pedido.subtotal))}`);
  if (esDelivery) {
    l.push(`Envio: ${Number(pedido.costoEnvio) > 0 ? formatearGuarani(Number(pedido.costoEnvio)) : "A coordinar"}`);
  }
  l.push(`TOTAL: ${formatearGuarani(Number(pedido.total))}`);
  if (esFactura) l.push(`SON: ${numeroALetras(Number(pedido.total))} GUARANIES`);
  l.push(sep());

  if (esFactura) {
    l.push("DETALLE FISCAL");
    if (Number(pedido.facturaGravado10 ?? 0) > 0) l.push(filaEtiqueta("GRAVADAS 10%", formatearGuarani(Number(pedido.facturaGravado10)), 12));
    if (Number(pedido.facturaGravado5 ?? 0) > 0) l.push(filaEtiqueta("GRAVADAS 5%", formatearGuarani(Number(pedido.facturaGravado5)), 12));
    if (Number(pedido.facturaExento ?? 0) > 0) l.push(filaEtiqueta("EXENTAS", formatearGuarani(Number(pedido.facturaExento)), 12));
    l.push(sep());
    l.push("LIQUIDACION IVA");
    if (Number(pedido.facturaIva10 ?? 0) > 0) l.push(filaEtiqueta("IVA 10%", formatearGuarani(Number(pedido.facturaIva10)), 9));
    if (Number(pedido.facturaIva5 ?? 0) > 0) l.push(filaEtiqueta("IVA 5%", formatearGuarani(Number(pedido.facturaIva5)), 9));
    l.push(filaEtiqueta("TOTAL IVA", formatearGuarani(Number(pedido.facturaIva10 ?? 0) + Number(pedido.facturaIva5 ?? 0)), 9));
    l.push(sep());
    l.push("ORIGINAL: CLIENTE");
    l.push("DUPLICADO: ARCHIVO TRIBUTARIO");
  } else {
    l.push(`Pago: ${sinAcentos(etiquetaMetodoPago(pedido.metodoPagoReferencia))}`);
    l.push(
      `Entrega: ${
        esDelivery
          ? `Delivery - ${sinAcentos(pedido.deliveryZone?.nombre ?? "a coordinar")}`
          : pedido.tipoEntrega === "mesa"
            ? `Mesa ${pedido.mesaNumero ?? "-"}`
            : "Retiro en el local"
      }`
    );
    if (esDelivery && pedido.direccion) l.push(`Direccion: ${sinAcentos(pedido.direccion)}`);
    if (esDelivery && pedido.repartidor) l.push(`Repartidor: ${sinAcentos(pedido.repartidor.nombre)}`);
    if (pedido.notas) l.push(`Nota: ${sinAcentos(pedido.notas)}`);
    l.push(sep());
  }

  l.push(centrado("Gracias por su compra!"));
  l.push(centrado(esFactura ? "Documento valido como Factura Autoimpresor." : "Este comprobante no es una factura legal."));
  l.push(sep());

  if (esAnulado) {
    l.push(centrado(negrita("*** ANULADA ***")));
    l.push("Pedido cancelado - no es un comprobante valido.");
  }

  return new NextResponse(armarDocumento(l), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
