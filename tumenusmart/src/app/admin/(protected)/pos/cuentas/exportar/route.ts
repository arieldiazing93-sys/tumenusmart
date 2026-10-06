import { NextRequest, NextResponse } from "next/server";
import { negarSiNoPuede } from "@/lib/auth";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual, localActual } from "@/lib/local-actual";
import { calcularRangoFecha } from "@/lib/rango-fecha";
import { etiquetaFormaPagoPos, FORMA_PAGO_MIXTO } from "@/lib/turno-pos";
import { detallePagos, filtroPorFormaPago, montoCobradoConForma } from "@/lib/pago-venta";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import { nuevoLibro, filaTitulo, respuestaXlsx } from "@/lib/excel-reporte";
import { nombreCompleto } from "@/lib/agenda-personal";
import { cargarCuentasCanceladas, type CuentaCancelada } from "@/lib/cuentas-canceladas";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // Ruta de API: no pasa por el layout del panel, así que valida la sesión
  // por su cuenta.
  const negado = await negarSiNoPuede("pos.vender");
  if (negado) return negado;

  const { searchParams } = new URL(request.url);
  const fecha = searchParams.get("fecha") ?? "hoy";
  const desde = searchParams.get("desde") ?? undefined;
  const hasta = searchParams.get("hasta") ?? undefined;
  const formaPago = searchParams.get("formaPago") ?? undefined;

  const rango = calcularRangoFecha(fecha, desde, hasta) ?? calcularRangoFecha("hoy", undefined, undefined)!;

  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);
  const [local, canceladasMesa, ventas] = await Promise.all([
    localActual(),
    // Las cuentas (de mesa y de delivery) que se cerraron sin cobrar también van en el reporte (una cuenta sin cobrar no tiene
    // forma de pago: al filtrar por una, no entran). Es la misma función que usa la pantalla.
    formaPago ? Promise.resolve<CuentaCancelada[]>([]) : cargarCuentasCanceladas(db, rango),
    db.ventaPos.findMany({
      where: { creadoEn: { gte: rango.gte, lt: rango.lt }, ...filtroPorFormaPago(formaPago) },
      orderBy: { creadoEn: "asc" },
      select: {
        numero: true,
        total: true,
        formaPago: true,
        pagos: { orderBy: { orden: "asc" }, select: { forma: true, monto: true } },
        registradoPor: true,
        creadoEn: true,
        cancelada: true,
        personal: { select: { nombre: true, apellido: true } },
      },
    }),
  ]);

  const opcionesFecha: Intl.DateTimeFormatOptions = {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: ZONA_NEGOCIO,
  };
  // El rango manual con hora (desde/hasta con "T", de un datetime-local) usa
  // instantes exactos, no días enteros — mostrar hora y hora evita que el
  // período impreso diga "16/09 - 16/09" cuando en realidad se cortó a mitad
  // del día 17.
  const esRangoConHora = fecha === "rango" && ((desde?.includes("T") ?? false) || (hasta?.includes("T") ?? false));
  const periodo = esRangoConHora
    ? `${rango.gte.toLocaleString("es-PY", { ...opcionesFecha, hour: "2-digit", minute: "2-digit", hour12: false })} - ${rango.lt.toLocaleString("es-PY", { ...opcionesFecha, hour: "2-digit", minute: "2-digit", hour12: false })}`
    : `${rango.gte.toLocaleDateString("es-PY", opcionesFecha)} - ${new Date(rango.lt.getTime() - 24 * 60 * 60 * 1000).toLocaleDateString("es-PY", opcionesFecha)}`;

  const { libro, hoja } = nuevoLibro("Cuentas POS");
  hoja.columns = [
    { width: 12 },
    { width: 14 },
    { width: 12 },
    { width: 40 },
    { width: 20 },
    { width: 20 },
    { width: 22 },
    { width: 16 },
    { width: 46 },
  ];

  filaTitulo(hoja, ["Negocio", local.nombre], 2);
  filaTitulo(hoja, ["Reporte", "Historial de cuentas"], 2);
  filaTitulo(hoja, ["Período", periodo], 2);
  hoja.addRow([]);

  filaTitulo(hoja, ["Cuenta", "Fecha", "Hora", "Forma de pago", "Cajero", "Personal", "Estado", "Total (Gs.)", "Motivo"], 9);
  // Las canceladas quedan en la planilla para que no desaparezcan del
  // registro, pero no suman al total: no es plata que haya entrado a la caja.
  // Filtrando por una forma concreta se suma solo lo cobrado CON esa forma (de
  // una venta dividida, la parte y no la cuenta entera).
  const filtraPorUnaForma = !!formaPago && formaPago !== FORMA_PAGO_MIXTO;
  let total = 0;
  let totalCanceladasMesa = 0;
  // Ventas y cuentas canceladas sin cobrar, juntas y en orden de fecha (de la más vieja a la más nueva).
  const lineas = [
    ...ventas.map((v) => ({ fecha: v.creadoEn, venta: v, cuenta: null as CuentaCancelada | null })),
    ...canceladasMesa.map((c) => ({
      fecha: c.cerradaEn ?? new Date(0),
      venta: null,
      cuenta: c as CuentaCancelada | null,
    })),
  ].sort((a, b) => a.fecha.getTime() - b.fecha.getTime());

  for (const linea of lineas) {
    const v = linea.venta;
    if (!v) {
      // Una cuenta (de mesa o de delivery) cerrada SIN cobrar: no suma al total (no entró plata) pero queda en la planilla, con
      // quién la canceló, cuándo y por qué.
      const c = linea.cuenta;
      if (!c) continue;
      totalCanceladasMesa += c.total;
      const motivo = [
        c.motivoCierre ? `Motivo: ${c.motivoCierre}` : "",
        c.unoPorUno ? "Productos cancelados de a uno" : "",
      ]
        .filter(Boolean)
        .join(" · ");
      const filaMesa = hoja.addRow([
        `${c.titulo} · ${c.etiqueta}`,
        c.cerradaEn ? c.cerradaEn.toLocaleDateString("es-PY", opcionesFecha) : "—",
        c.cerradaEn
          ? c.cerradaEn.toLocaleTimeString("es-PY", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: ZONA_NEGOCIO })
          : "—",
        "Sin cobrar",
        c.cerradaPor ? `${c.cerradaPor} (la canceló)` : "—",
        `${c.responsable} (${c.rolResponsable})`,
        "Cancelada sin cobrar",
        Math.round(c.total),
        motivo,
      ]);
      filaMesa.getCell(8).numFmt = "#,##0";
      continue;
    }
    if (!v.cancelada) {
      total += filtraPorUnaForma ? montoCobradoConForma(v.pagos, formaPago ?? "") : Number(v.total);
    }
    const fila = hoja.addRow([
      v.numero,
      v.creadoEn.toLocaleDateString("es-PY", opcionesFecha),
      v.creadoEn.toLocaleTimeString("es-PY", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: ZONA_NEGOCIO,
      }),
      v.pagos.length > 1
        ? detallePagos(v.pagos.map((p) => ({ forma: p.forma, monto: Number(p.monto) })))
        : etiquetaFormaPagoPos(v.formaPago),
      v.registradoPor,
      v.personal ? nombreCompleto(v.personal) : "—",
      v.cancelada ? "Cancelada" : "Activa",
      Math.round(Number(v.total)),
      "",
    ]);
    fila.getCell(8).numFmt = "#,##0";
  }

  hoja.addRow([]);
  const filaTotal = filaTitulo(
    hoja,
    [
      "",
      "",
      "",
      "",
      "",
      "",
      filtraPorUnaForma
        ? `TOTAL cobrado en ${etiquetaFormaPagoPos(formaPago ?? "").toLowerCase()}, sin canceladas (Gs.)`
        : "TOTAL GENERAL, sin canceladas (Gs.)",
      Math.round(total),
      "",
    ],
    9
  );
  filaTotal.getCell(8).numFmt = "#,##0";

  // Lo que se cerró sin cobrar, aparte y a la vista: no es plata que entró, pero es plata de la que hay que poder dar cuenta.
  if (canceladasMesa.length > 0) {
    const filaSinCobrar = filaTitulo(
      hoja,
      ["", "", "", "", "", "", `CUENTAS CANCELADAS SIN COBRAR: ${canceladasMesa.length} (Gs.)`, Math.round(totalCanceladasMesa), ""],
      9
    );
    filaSinCobrar.getCell(8).numFmt = "#,##0";
  }

  if (ventas.length === 0 && canceladasMesa.length === 0) {
    hoja.addRow([]);
    hoja.addRow(["No se registraron cuentas en este período."]);
  }

  return respuestaXlsx(libro, `cuentas_pos_${fecha}.xlsx`);
}
