import { NextResponse } from "next/server";
import { pantallaConPermiso } from "@/lib/auth";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { formatearGuarani, formatearMiles, formatearNumero, sinAcentos } from "@/lib/format";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import { etiquetaFormaPropina } from "@/lib/propinas";
import { armarDocumento, centrado, filaTabla, separador } from "@/lib/escpos";

export const dynamic = "force-dynamic";

/**
 * El comprobante de un PAGO DE PROPINAS a un mozo, en texto crudo (ESC/POS) para la impresora del ticket de la estación (QZ Tray).
 * `id` es el retiro de caja con el que se pagaron. Lleva el local, la fecha, el mozo, cada propina que se pagó, el total, quién la
 * pagó (el cajero) y una línea para que el mozo firme que la recibió. Sirve para imprimirlo al pagar y para reimprimirlo después.
 * Siempre sale una vez: no depende de las copias del ticket de venta (un local que no imprime ticket igual necesita este papel).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await pantallaConPermiso("comedor.gestionar");
  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);
  const { id } = await params;

  const [propinas, store] = await Promise.all([
    db.propinaMozo.findMany({
      where: { pagoMovimientoId: id, estado: "pagada" },
      orderBy: { createdAt: "asc" },
      select: {
        monto: true,
        forma: true,
        createdAt: true,
        cuentaMesaId: true,
        pagadaEn: true,
        pagadaPor: true,
        mozo: { select: { nombre: true, apellido: true } },
      },
    }),
    db.store.findUnique({ where: { id: storeId }, select: { nombre: true } }),
  ]);
  if (propinas.length === 0) return new NextResponse("No encontrado", { status: 404 });

  const idsDeCuentas = [...new Set(propinas.flatMap((p) => (p.cuentaMesaId ? [p.cuentaMesaId] : [])))];
  const cuentas = idsDeCuentas.length
    ? await db.cuentaMesa.findMany({ where: { id: { in: idsDeCuentas } }, select: { id: true, numero: true, mesa: true } })
    : [];
  const textoDeCuenta = new Map(cuentas.map((c) => [c.id, `Mesa ${c.mesa} ${formatearNumero(c.numero)}`]));

  const mozo = [propinas[0].mozo.nombre, propinas[0].mozo.apellido].filter(Boolean).join(" ");
  const total = propinas.reduce((s, p) => s + Number(p.monto), 0);
  const pagadaEn = propinas[0].pagadaEn ?? new Date();
  const fecha = pagadaEn.toLocaleString("es-PY", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: ZONA_NEGOCIO,
  });
  const corta = (d: Date) =>
    d.toLocaleDateString("es-PY", { day: "2-digit", month: "2-digit", timeZone: ZONA_NEGOCIO });

  const l: string[] = [];
  l.push(separador("="));
  l.push(centrado(sinAcentos(store?.nombre ?? "Comprobante").toUpperCase()));
  l.push(centrado("PAGO DE PROPINAS"));
  l.push(separador("="));
  l.push(`Fecha: ${fecha}`);
  l.push(`Mozo : ${sinAcentos(mozo)}`);
  l.push(separador());
  l.push(`Propinas pagadas (${propinas.length}):`);
  for (const p of propinas) {
    // "04/10 Mesa 2 #0003 Tarjeta debito" en la descripcion y el monto a la derecha.
    const detalle = `${corta(p.createdAt)} ${p.cuentaMesaId ? (textoDeCuenta.get(p.cuentaMesaId) ?? "") : ""}`.trim();
    l.push(filaTabla("", sinAcentos(detalle), formatearMiles(Number(p.monto))));
    l.push(`     ${sinAcentos(etiquetaFormaPropina(p.forma))}`);
  }
  l.push(separador());
  l.push(`TOTAL PAGADO: ${formatearGuarani(total)}`);
  l.push("Pagado en efectivo desde la caja");
  l.push("(retiro de caja).");
  l.push(separador());
  l.push(`Pago el cajero: ${sinAcentos(propinas[0].pagadaPor ?? "-")}`);
  l.push(`Recibe el mozo: ${sinAcentos(mozo)}`);
  l.push("");
  l.push("");
  l.push("Recibi conforme:");
  l.push("");
  l.push("");
  l.push("________________________________");
  l.push(sinAcentos(mozo));

  return new NextResponse(armarDocumento(l), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "X-Copias": "1" },
  });
}
