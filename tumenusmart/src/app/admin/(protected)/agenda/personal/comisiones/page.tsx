import { pantallaConPermiso } from "@/lib/auth";
import { puede } from "@/lib/permisos";
import { idLocalActual } from "@/lib/local-actual";
import { prisma } from "@/lib/prisma";
import { prismaDelLocal } from "@/lib/prisma-local";
import { estacionActual } from "@/lib/estacion-actual";
import { formatearGuarani } from "@/lib/format";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import { nombreCompleto } from "@/lib/agenda-personal";
import { textoDelPeriodo } from "@/lib/comision-mozo";
import { saldosDeComisionPersonal } from "@/lib/comision-personal-servidor";
import { BotonEnlace, Cabecera } from "@/components/ui";
import { turnoAbierto } from "../../../pos/turno-actual";
import { PanelComisiones, type PagoDeComisionFila, type PersonaConComision } from "../../../comedor/comisiones/PanelComisiones";

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

function porcentaje(valor: number | null): string {
  return String(valor ?? 0).replace(".", ",");
}

/**
 * Las comisiones del personal de la Reserva de turnos (Reserva de turnos → Comisiones). Lo que cada persona ganó por los trabajos
 * cobrados y los productos que vendió, lo que ya se le pagó y lo que se le debe. Se le paga desde la caja —hoy o en otra fecha, todo o una
 * parte— y cada pago sale como un RETIRO DE CAJA en el turno abierto, con su comprobante para que firme. Es del dueño (ve comisiones).
 */
export default async function ComisionesPersonalPage() {
  const sesion = await pantallaConPermiso("agenda.configurar");
  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);

  const [equipo, saldos, historial, estacion] = await Promise.all([
    db.miembroPersonal.findMany({
      orderBy: [{ activo: "desc" }, { orden: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      select: { id: true, nombre: true, apellido: true, activo: true, comisionPorcentaje: true, comisionProductoPorcentaje: true },
    }),
    saldosDeComisionPersonal(prisma, storeId),
    db.pagoComisionPersonal.findMany({
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
        personal: { select: { nombre: true, apellido: true } },
      },
    }),
    estacionActual(db),
  ]);

  // Se muestran las personas activas con alguna comisión, y cualquiera (aunque ya no esté activa) a la que todavía se le debe algo o se le pagó.
  const filas: PersonaConComision[] = equipo
    .map((p) => {
      const s = saldos.get(p.id);
      const servicio = p.comisionPorcentaje == null ? null : Number(p.comisionPorcentaje);
      const producto = p.comisionProductoPorcentaje == null ? null : Number(p.comisionProductoPorcentaje);
      const conComision = (servicio ?? 0) > 0 || (producto ?? 0) > 0;
      return {
        fila: {
          id: p.id,
          nombre: nombreCompleto(p),
          activo: p.activo,
          etiquetaPorcentaje: conComision
            ? [
                (servicio ?? 0) > 0 ? `Servicio ${porcentaje(servicio)} %` : null,
                (producto ?? 0) > 0 ? `Producto ${porcentaje(producto)} %` : null,
              ]
                .filter(Boolean)
                .join(" · ")
            : "Sin comisión configurada",
          ganada: s?.ganada ?? 0,
          pagada: s?.pagada ?? 0,
          pendiente: s?.pendiente ?? 0,
        },
        conComision,
      };
    })
    .filter(({ fila, conComision }) => fila.ganada > 0 || fila.pagada > 0 || (fila.activo && conComision))
    .map(({ fila }) => fila)
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
    persona: nombreCompleto(p.personal),
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

  // La impresora del ticket de esta estación: ahí sale el comprobante del pago (la persona lo firma). Sin ella no se imprime solo.
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
        titulo="Comisiones del personal"
        bajada={`Lo que cada persona ganó por los trabajos que cobró y los productos que vendió, lo que ya se le pagó y lo que se le debe. Se le paga en efectivo desde la caja, hoy o en otra fecha, todo o una parte: sale como retiro de caja del turno abierto. Pendiente en total: ${formatearGuarani(totalPendiente)}.`}
        acciones={
          <BotonEnlace href="/admin/agenda/personal/reporte" tono="navegar" tam="md">
            Ver reporte de personal
          </BotonEnlace>
        }
      />
      <PanelComisiones
        rol="personal"
        personas={filas}
        pagos={pagos}
        puedePagar={motivoNoPuede === null}
        motivoNoPuede={motivoNoPuede}
        nombreImpresoraTicket={nombreImpresoraTicket}
      />
    </div>
  );
}
