import { NextResponse } from "next/server";
import { pantallaConPermiso } from "@/lib/auth";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { formatearGuarani, sinAcentos } from "@/lib/format";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import { textoDelPeriodo } from "@/lib/comision-mozo";
import { armarDocumento, centrado, separador } from "@/lib/escpos";

export const dynamic = "force-dynamic";

/**
 * El comprobante de un PAGO DE COMISIÓN a un mozo, en texto crudo (ESC/POS) para la impresora del ticket de la estación (QZ Tray).
 * `id` es el retiro de caja con el que se pagó. Lleva el local, la fecha, el mozo, el período de ventas (si se anotó), el monto, quién
 * lo pagó (el cajero) y una línea para que el mozo firme que lo recibió. Sirve para imprimirlo al pagar y para reimprimirlo después.
 * Siempre sale una vez: no depende de las copias del ticket de venta (un local que no imprime ticket igual necesita este papel).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await pantallaConPermiso("comedor.gestionar");
  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);
  const { id } = await params;

  const [pago, store] = await Promise.all([
    db.pagoComisionMozo.findFirst({
      where: { movimientoCajaId: id },
      select: {
        monto: true,
        desde: true,
        hasta: true,
        nota: true,
        registradoPor: true,
        createdAt: true,
        mozo: { select: { nombre: true, apellido: true } },
      },
    }),
    db.store.findUnique({ where: { id: storeId }, select: { nombre: true } }),
  ]);
  if (!pago) return new NextResponse("No encontrado", { status: 404 });

  const mozo = [pago.mozo.nombre, pago.mozo.apellido].filter(Boolean).join(" ");
  const fecha = pago.createdAt.toLocaleString("es-PY", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: ZONA_NEGOCIO,
  });
  const periodo = textoDelPeriodo(pago.desde, pago.hasta);

  const l: string[] = [];
  l.push(separador("="));
  l.push(centrado(sinAcentos(store?.nombre ?? "Comprobante").toUpperCase()));
  l.push(centrado("PAGO DE COMISION"));
  l.push(separador("="));
  l.push(`Fecha: ${fecha}`);
  l.push(`Mozo : ${sinAcentos(mozo)}`);
  if (periodo) l.push(`Ventas ${sinAcentos(periodo)}`);
  if (pago.nota) l.push(`Nota : ${sinAcentos(pago.nota)}`);
  l.push(separador());
  l.push(`TOTAL PAGADO: ${formatearGuarani(Number(pago.monto))}`);
  l.push("Pagado en efectivo desde la caja");
  l.push("(retiro de caja).");
  l.push(separador());
  l.push(`Pago el cajero: ${sinAcentos(pago.registradoPor || "-")}`);
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
