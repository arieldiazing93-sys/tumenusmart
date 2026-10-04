import { pantallaConPermiso } from "@/lib/auth";
import { puede } from "@/lib/permisos";
import { idLocalActual } from "@/lib/local-actual";
import { prismaDelLocal } from "@/lib/prisma-local";
import { estacionActual } from "@/lib/estacion-actual";
import { formatearGuarani, formatearNumero } from "@/lib/format";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import { Cabecera } from "@/components/ui";
import { turnoAbierto } from "../../pos/turno-actual";
import { PanelPropinas, type MozoConPropinas, type PagoDePropinas, type PropinaFila } from "./PanelPropinas";

export const dynamic = "force-dynamic";

function fechaHora(d: Date): string {
  return d.toLocaleString("es-PY", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: ZONA_NEGOCIO,
  });
}

/**
 * Las propinas de los mozos (Servicio comedor → Propinas). La que el cliente deja con tarjeta o transferencia al pagar la cuenta
 * entra al negocio pero es del mozo: acá se ve lo que se le debe a cada uno, se le paga en efectivo desde la caja (queda como un
 * retiro de caja en el turno abierto) y queda el detalle de cada propina y de cada pago. Las propinas en efectivo no se cargan.
 */
export default async function PropinasPage() {
  const sesion = await pantallaConPermiso("comedor.gestionar");
  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);

  const [resumen, historial, estacion] = await Promise.all([
    db.propinaMozo.groupBy({
      by: ["mozoId"],
      where: { estado: "pendiente" },
      _sum: { monto: true },
      _count: { _all: true },
    }),
    db.propinaMozo.findMany({
      orderBy: { createdAt: "desc" },
      take: 150,
      select: {
        id: true,
        cuentaMesaId: true,
        monto: true,
        forma: true,
        estado: true,
        createdAt: true,
        registradoPor: true,
        motivoAnulacion: true,
        pagadaEn: true,
        pagadaPor: true,
        pagoMovimientoId: true,
        mozo: { select: { nombre: true, apellido: true } },
      },
    }),
    estacionActual(db),
  ]);

  const nombre = (m: { nombre: string; apellido: string | null }) => [m.nombre, m.apellido].filter(Boolean).join(" ");

  // Los nombres de los mozos con propinas pendientes (aunque ya no estén activos: se les sigue debiendo).
  const idsPendientes = resumen.map((r) => r.mozoId);
  const mozosPendientes = idsPendientes.length
    ? await db.mozo.findMany({ where: { id: { in: idsPendientes } }, select: { id: true, nombre: true, apellido: true } })
    : [];
  const nombreDelMozo = new Map(mozosPendientes.map((m) => [m.id, nombre(m)]));
  const mozos: MozoConPropinas[] = resumen
    .map((r) => ({
      mozoId: r.mozoId,
      nombre: nombreDelMozo.get(r.mozoId) ?? "Mozo",
      cantidad: r._count._all,
      total: Number(r._sum.monto ?? 0),
    }))
    .sort((a, b) => b.total - a.total);
  const totalPendiente = mozos.reduce((s, m) => s + m.total, 0);

  // De qué cuenta salió cada propina ("Mesa 3 · Cuenta #0005").
  const idsDeCuentas = [...new Set(historial.flatMap((p) => (p.cuentaMesaId ? [p.cuentaMesaId] : [])))];
  const cuentas = idsDeCuentas.length
    ? await db.cuentaMesa.findMany({ where: { id: { in: idsDeCuentas } }, select: { id: true, numero: true, mesa: true } })
    : [];
  const textoDeCuenta = new Map(cuentas.map((c) => [c.id, `Mesa ${c.mesa} · Cuenta ${formatearNumero(c.numero)}`]));

  const propinas: PropinaFila[] = historial.map((p) => ({
    id: p.id,
    mozo: nombre(p.mozo),
    cuenta: p.cuentaMesaId ? (textoDeCuenta.get(p.cuentaMesaId) ?? null) : null,
    monto: Number(p.monto),
    forma: p.forma,
    estado: p.estado,
    fecha: fechaHora(p.createdAt),
    registradoPor: p.registradoPor,
    motivoAnulacion: p.motivoAnulacion,
  }));

  // Los pagos hechos: las propinas pagadas juntas con un mismo retiro de caja son un solo pago.
  const idsDeMovimientos = [...new Set(historial.flatMap((p) => (p.pagoMovimientoId ? [p.pagoMovimientoId] : [])))];
  const movimientos = idsDeMovimientos.length
    ? await db.movimientoCaja.findMany({
        where: { id: { in: idsDeMovimientos } },
        select: { id: true, turnoPos: { select: { estado: true } } },
      })
    : [];
  const turnoAbiertoDelMovimiento = new Map(movimientos.map((m) => [m.id, m.turnoPos.estado === "abierto"]));
  const pagosPorMovimiento = new Map<string, PagoDePropinas>();
  for (const p of historial) {
    if (p.estado !== "pagada" || !p.pagoMovimientoId || !p.pagadaEn) continue;
    const existente = pagosPorMovimiento.get(p.pagoMovimientoId);
    if (existente) {
      existente.total += Number(p.monto);
      existente.cantidad += 1;
    } else {
      pagosPorMovimiento.set(p.pagoMovimientoId, {
        movimientoId: p.pagoMovimientoId,
        mozo: nombre(p.mozo),
        total: Number(p.monto),
        cantidad: 1,
        fecha: fechaHora(p.pagadaEn),
        pagadoPor: p.pagadaPor ?? "—",
        sePuedeDeshacer: turnoAbiertoDelMovimiento.get(p.pagoMovimientoId) === true,
      });
    }
  }
  const pagos = [...pagosPorMovimiento.values()];

  // Pagar saca efectivo de la caja: hace falta permiso de vender y un turno abierto en la estación de esta computadora.
  let motivoNoPuede: string | null = null;
  if (!puede(sesion.rol, "pos.vender")) {
    motivoNoPuede = "No tenés permiso para pagar propinas (sale de la caja): pedile a quien tenga el permiso de vender.";
  } else if (!estacion) {
    motivoNoPuede = "Esta computadora no está vinculada a una estación. Vinculala en Estaciones para poder pagar propinas.";
  } else if (!(await turnoAbierto(db, estacion.id))) {
    motivoNoPuede = "No hay un turno de caja abierto en esta estación. Abrilo en Punto de venta: el pago de propinas sale de la caja.";
  }

  // La impresora del ticket de esta estación: ahí sale el comprobante del pago (el mozo lo firma). Sin ella no se imprime solo.
  let nombreImpresoraTicket: string | null = null;
  if (estacion) {
    const datos = await db.estacion.findUnique({
      where: { id: estacion.id },
      select: { areaTicketId: true, impresoras: { select: { areaImpresionId: true, nombreImpresora: true } } },
    });
    nombreImpresoraTicket = datos?.areaTicketId
      ? (datos.impresoras.find((i) => i.areaImpresionId === datos.areaTicketId)?.nombreImpresora ?? null)
      : null;
  }

  return (
    <div className="flex flex-col gap-4">
      <Cabecera
        titulo="Propinas"
        bajada={`Lo que los clientes dejaron con tarjeta o transferencia es de los mozos: acá se acumula y se les paga en efectivo desde la caja (queda como retiro de caja). Pendiente en total: ${formatearGuarani(totalPendiente)}. Las propinas en efectivo no se cargan.`}
      />
      <PanelPropinas
        mozos={mozos}
        propinas={propinas}
        pagos={pagos}
        puedePagar={motivoNoPuede === null}
        motivoNoPuede={motivoNoPuede}
        nombreImpresoraTicket={nombreImpresoraTicket}
      />
    </div>
  );
}
