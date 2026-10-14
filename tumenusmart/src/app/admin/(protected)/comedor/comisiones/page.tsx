import { pantallaConPermiso } from "@/lib/auth";
import { puede } from "@/lib/permisos";
import { idLocalActual } from "@/lib/local-actual";
import { prisma } from "@/lib/prisma";
import { prismaDelLocal } from "@/lib/prisma-local";
import { estacionActual } from "@/lib/estacion-actual";
import { formatearGuarani } from "@/lib/format";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import { textoDelPeriodo } from "@/lib/comision-mozo";
import { saldosDeComision } from "@/lib/comision-mozo-servidor";
import { Cabecera } from "@/components/ui";
import { turnoAbierto } from "../../pos/turno-actual";
import { PanelComisiones, type MozoConComision, type PagoDeComisionFila } from "./PanelComisiones";

export const dynamic = "force-dynamic";

function fechaHora(d: Date): string {
  return d.toLocaleString("es-PY", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: ZONA_NEGOCIO,
  });
}

/**
 * Las comisiones de los mozos (Servicio comedor → Comisiones). Lo que cada mozo ganó por las cuentas que cobró (el % que tenía al
 * cobrar, ver Mozos), lo que ya se le pagó y lo que se le debe. Se le paga desde la caja —hoy o en otra fecha, todo o una parte— y
 * cada pago sale como un RETIRO DE CAJA en el turno abierto, con su comprobante para que el mozo firme.
 */
export default async function ComisionesPage() {
  const sesion = await pantallaConPermiso("comedor.gestionar");
  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);

  const [mozos, saldos, historial, estacion] = await Promise.all([
    db.mozo.findMany({
      select: { id: true, nombre: true, apellido: true, activo: true, comisionPorcentaje: true },
      orderBy: { nombre: "asc" },
    }),
    saldosDeComision(prisma, storeId),
    db.pagoComisionMozo.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        monto: true,
        desde: true,
        hasta: true,
        nota: true,
        movimientoCajaId: true,
        turnoPosId: true,
        registradoPor: true,
        createdAt: true,
        mozo: { select: { nombre: true, apellido: true } },
      },
    }),
    estacionActual(db),
  ]);

  const nombre = (m: { nombre: string; apellido: string | null }) => [m.nombre, m.apellido].filter(Boolean).join(" ");

  // Se muestran los mozos activos con comisión, y cualquiera (aunque ya no esté activo) al que todavía se le debe algo o se le pagó.
  const filas: MozoConComision[] = mozos
    .map((m) => {
      const s = saldos.get(m.id);
      return {
        mozoId: m.id,
        nombre: nombre(m),
        activo: m.activo,
        porcentaje: m.comisionPorcentaje == null ? null : Number(m.comisionPorcentaje),
        ganada: s?.ganada ?? 0,
        pagada: s?.pagada ?? 0,
        pendiente: s?.pendiente ?? 0,
      };
    })
    .filter((m) => m.ganada > 0 || m.pagada > 0 || (m.activo && (m.porcentaje ?? 0) > 0))
    .sort((a, b) => b.pendiente - a.pendiente || a.nombre.localeCompare(b.nombre, "es"));
  const totalPendiente = filas.reduce((s, m) => s + m.pendiente, 0);

  // Qué pagos se pueden deshacer: los de un turno que sigue abierto (después quedó firmado en el cierre).
  const idsDeTurnos = [...new Set(historial.map((p) => p.turnoPosId))];
  const turnos = idsDeTurnos.length
    ? await db.turnoPos.findMany({ where: { id: { in: idsDeTurnos } }, select: { id: true, estado: true } })
    : [];
  const turnoAbiertoPorId = new Map(turnos.map((t) => [t.id, t.estado === "abierto"]));

  const pagos: PagoDeComisionFila[] = historial.map((p) => ({
    id: p.id,
    movimientoId: p.movimientoCajaId,
    mozo: nombre(p.mozo),
    monto: Number(p.monto),
    periodo: textoDelPeriodo(p.desde, p.hasta),
    nota: p.nota,
    fecha: fechaHora(p.createdAt),
    pagadoPor: p.registradoPor,
    sePuedeDeshacer: turnoAbiertoPorId.get(p.turnoPosId) === true,
  }));

  // Pagar saca efectivo de la caja: hace falta permiso de vender y un turno abierto en la estación de esta computadora.
  let motivoNoPuede: string | null = null;
  if (!puede(sesion.rol, "pos.vender")) {
    motivoNoPuede = "No tenés permiso para pagar comisiones (sale de la caja): pedile a quien tenga el permiso de vender.";
  } else if (!estacion) {
    motivoNoPuede = "Esta computadora no está vinculada a una estación. Vinculala en Estaciones para poder pagar comisiones.";
  } else if (!(await turnoAbierto(db, estacion.id))) {
    motivoNoPuede = "No hay un turno de caja abierto en esta estación. Abrilo en Punto de venta: el pago de comisiones sale de la caja.";
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
        titulo="Comisiones de los mozos"
        bajada={`Lo que cada mozo ganó por las cuentas que cobró, lo que ya se le pagó y lo que se le debe. Se le paga en efectivo desde la caja, hoy o en otra fecha, todo o una parte: sale como retiro de caja del turno abierto. Pendiente en total: ${formatearGuarani(totalPendiente)}.`}
      />
      <PanelComisiones
        mozos={filas}
        pagos={pagos}
        puedePagar={motivoNoPuede === null}
        motivoNoPuede={motivoNoPuede}
        nombreImpresoraTicket={nombreImpresoraTicket}
      />
    </div>
  );
}
