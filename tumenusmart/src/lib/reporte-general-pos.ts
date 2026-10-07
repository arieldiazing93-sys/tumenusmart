/**
 * El reporte general de cuentas: todo lo que se cobró en el Punto de Venta, en una sola lista ordenada por fecha, con el importe de cada
 * venta repartido en su columna de forma de pago — mismo criterio que un libro de caja de toda la vida. "General" quiere decir
 * general: todo lo que se cobró, venga de donde venga.
 *
 * Las ventas entran por las cuatro formas de vender que hay hoy, cada una en su propia columna de identificación:
 *   - Mostrador (Punto de Venta),
 *   - Servicio comedor (la cuenta de una mesa),
 *   - Servicio delivery (la cuenta de un pedido a domicilio),
 *   - Reserva de turnos (la cita cobrada).
 * Todas son una venta del Punto de Venta (`VentaPos`) con el número que se ve en el Historial de cuentas; el canal sale de la cuenta o la
 * cita que se cobró con esa venta.
 *
 * Una venta entra con la fecha en que se COBRÓ y con la forma de pago con la que se cobró; una a crédito no entra hasta que se cobra
 * (entonces entra cada cobro, con su forma de pago).
 */
import { prismaDelLocal } from "./prisma-local";
import { normalizarFormaPagoPos, FORMAS_PAGO_POS, FORMA_PAGO_A_CREDITO, type FormaPagoPos } from "./turno-pos";

/** Por dónde se vendió: las cuatro formas de vender. */
export type CanalDeVenta = "mostrador" | "comedor" | "delivery" | "reserva";

/** Las cuatro formas de vender, en el orden en que van sus columnas, con el rótulo de cada una. */
export const COLUMNAS_CANAL: { valor: CanalDeVenta; etiqueta: string }[] = [
  { valor: "mostrador", etiqueta: "Mostrador" },
  { valor: "comedor", etiqueta: "Comedor" },
  { valor: "delivery", etiqueta: "Delivery" },
  { valor: "reserva", etiqueta: "Reserva" },
];

export type FilaReporteGeneral = {
  n: number;
  /** Número correlativo de la venta para mostrar (ver formatearNumero). */
  idVenta: number;
  /** El id real (cuid) de la base, para armar el link — nunca se muestra. */
  idVentaDb: string;
  /** De cuál de las cuatro formas de vender es. */
  canal: CanalDeVenta;
  fecha: Date;
  importe: number;
  formaPago: FormaPagoPos;
};

export type ReporteGeneralPos = {
  filas: FilaReporteGeneral[];
  totalImporte: number;
  totalPorForma: Record<FormaPagoPos, number>;
  /** Cuánto se cobró por cada forma de vender. */
  totalPorCanal: Record<CanalDeVenta, number>;
};

export async function calcularReporteGeneralPos(
  storeId: string,
  rango: { gte: Date; lt: Date }
): Promise<ReporteGeneralPos> {
  const db = prismaDelLocal(storeId);

  const [ventas, cobros] = await Promise.all([
    // Las ventas a crédito no entran: este reporte es lo que se COBRÓ. Cuando
    // el cliente paga, aparece el cobro (más abajo).
    db.ventaPos.findMany({
      where: {
        creadoEn: { gte: rango.gte, lt: rango.lt },
        cancelada: false,
        formaPago: { not: FORMA_PAGO_A_CREDITO },
      },
      select: {
        id: true,
        numero: true,
        total: true,
        formaPago: true,
        creadoEn: true,
        // Una venta con pago dividido aporta una fila por cada forma usada.
        pagos: { orderBy: { orden: "asc" }, select: { forma: true, monto: true } },
      },
    }),
    // Los cobros de ventas a crédito, por el instante en que se cargaron (la
    // fecha del cobro es solo un día y no sirve para cortar por rango horario).
    db.cobroVenta.findMany({
      where: { createdAt: { gte: rango.gte, lt: rango.lt }, ventaPos: { cancelada: false } },
      select: { monto: true, formaPago: true, createdAt: true, ventaPos: { select: { id: true, numero: true } } },
    }),
  ]);

  // De dónde vino cada venta: la que cobró una cuenta de mesa es del comedor, la que cobró una cuenta de delivery es del delivery, la
  // que cobró una cita de la agenda es una reserva de turnos, y el resto es del mostrador. (Una cita "de mostrador" es la que crea el
  // propio Punto de Venta al asignarle una venta a alguien del personal: esa venta sigue siendo del mostrador.)
  const idsDeVentas = [...new Set([...ventas.map((v) => v.id), ...cobros.map((c) => c.ventaPos.id)])];
  const [cuentasMesa, cuentasDelivery, citas] = idsDeVentas.length
    ? await Promise.all([
        db.cuentaMesa.findMany({ where: { ventaPosId: { in: idsDeVentas } }, select: { ventaPosId: true } }),
        db.cuentaDelivery.findMany({ where: { ventaPosId: { in: idsDeVentas } }, select: { ventaPosId: true } }),
        db.cita.findMany({ where: { ventaPosId: { in: idsDeVentas }, origen: { not: "mostrador" } }, select: { ventaPosId: true } }),
      ])
    : [[], [], []];
  const delComedor = new Set(cuentasMesa.map((c) => c.ventaPosId));
  const delDelivery = new Set(cuentasDelivery.map((c) => c.ventaPosId));
  const deReserva = new Set(citas.map((c) => c.ventaPosId));
  const canalDe = (ventaId: string): CanalDeVenta =>
    delDelivery.has(ventaId) ? "delivery" : delComedor.has(ventaId) ? "comedor" : deReserva.has(ventaId) ? "reserva" : "mostrador";

  const combinadas = [
    // Una fila por cada forma de pago de la venta: una cuenta dividida (50.000
    // en efectivo + 50.000 con débito) aparece dos veces, cada una en su
    // columna. Sin detalle de pagos (una venta anterior a esto) cae en una sola
    // fila con su forma de siempre.
    ...ventas.flatMap((v) => {
      const partes =
        v.pagos.length > 0
          ? v.pagos.map((p) => ({ forma: p.forma, importe: Number(p.monto) }))
          : [{ forma: v.formaPago, importe: Number(v.total) }];
      return partes.map((p) => ({
        idVenta: v.numero,
        idVentaDb: v.id,
        canal: canalDe(v.id),
        fecha: v.creadoEn,
        importe: p.importe,
        formaPago: normalizarFormaPagoPos(p.forma),
      }));
    }),
    ...cobros.map((c) => ({
      idVenta: c.ventaPos.numero,
      idVentaDb: c.ventaPos.id,
      canal: canalDe(c.ventaPos.id),
      fecha: c.createdAt,
      importe: Number(c.monto),
      formaPago: normalizarFormaPagoPos(c.formaPago),
    })),
  ].sort((a, b) => a.fecha.getTime() - b.fecha.getTime());

  const filas: FilaReporteGeneral[] = combinadas.map((c, i) => ({ n: i + 1, ...c }));

  const totalPorForma: Record<FormaPagoPos, number> = {
    efectivo: 0,
    transferencia: 0,
    tarjeta_debito: 0,
    tarjeta_credito: 0,
  };
  const totalPorCanal: Record<CanalDeVenta, number> = { mostrador: 0, comedor: 0, delivery: 0, reserva: 0 };
  let totalImporte = 0;
  for (const f of filas) {
    totalImporte += f.importe;
    totalPorForma[f.formaPago] += f.importe;
    totalPorCanal[f.canal] += f.importe;
  }

  return { filas, totalImporte, totalPorForma, totalPorCanal };
}

/** Las 4 formas de pago, para que quien arma la tabla no repita el orden a mano. */
export const COLUMNAS_FORMA_PAGO = FORMAS_PAGO_POS;
