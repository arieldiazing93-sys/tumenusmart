import { redirect } from "next/navigation";
import Link from "next/link";
import { pantallaConPermiso } from "@/lib/auth";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { estacionActual } from "@/lib/estacion-actual";
import { Cabecera, Tarjeta, clasesBoton } from "@/components/ui";
import { resumirTurno } from "@/lib/turno-pos";
import { turnoAbierto, pedidosDelTurno, entregasSinRendir } from "../turno-actual";
import { CerrarTurnoForm } from "./CerrarTurnoForm";
import { EstacionNoVinculada } from "../EstacionNoVinculada";

export const dynamic = "force-dynamic";

export default async function CerrarTurnoPage() {
  await pantallaConPermiso("pos.vender");
  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);

  const estacion = await estacionActual(db);
  if (!estacion) return <EstacionNoVinculada />;

  const turno = await turnoAbierto(db, estacion.id);
  if (!turno) redirect("/admin/pos/abrir");

  // Corte general: si hay plata de delivery todavía circulando sin rendir
  // (en cualquier estación del local), no se puede cerrar caja — se avisa
  // ACÁ, antes de que el cajero pierda tiempo contando y cargando el corte
  // ciego para recién enterarse al confirmar (ver también la comprobación
  // real en cerrarTurno, pos/actions.ts).
  const pendientes = await entregasSinRendir(db);
  if (pendientes.length > 0) {
    const repartidores = [...new Set(pendientes.map((p) => p.repartidor?.nombre ?? "sin asignar"))];
    return (
      <div>
        <Cabecera titulo="Cerrar turno" />
        <Tarjeta className="max-w-lg shadow-sm">
          <p className="mb-3 rounded-lg bg-aviso-luz px-3.5 py-3 text-[0.85rem] font-medium text-aviso">
            Todavía no se puede cerrar: hay {pendientes.length}{" "}
            {pendientes.length === 1 ? "entrega" : "entregas"} de delivery sin rendir —{" "}
            {repartidores.join(", ")}. El corte general del turno necesita esa plata recibida
            primero.
          </p>
          <Link href="/admin/cierre" className={clasesBoton("navegar")}>
            Ir a recibir rendiciones
          </Link>
        </Tarjeta>
      </div>
    );
  }

  // Un solo cierre: ventas de mostrador + pedidos de retiro/mesa cobrados
  // durante este turno (ver cambiarEstadoPedido en pedidos/actions.ts).
  const [ventas, pedidos] = await Promise.all([
    db.ventaPos.findMany({
      where: { turnoPosId: turno.id, cancelada: false },
      select: { total: true, formaPago: true },
    }),
    pedidosDelTurno(db, turno.id),
  ]);
  const resumen = resumirTurno([
    ...ventas.map((v) => ({ total: Number(v.total), formaPago: v.formaPago })),
    ...pedidos
      .filter((p) => p.estado !== "cancelado")
      .map((p) => ({ total: Number(p.total), formaPago: p.formaPagoPos ?? "efectivo" })),
  ]);

  return (
    <div>
      <Cabecera
        titulo="Cerrar turno"
        bajada="Corte ciego: contá la caja y declará cada forma de pago antes de ver lo que calculó el sistema."
      />
      <Tarjeta className="max-w-lg shadow-sm">
        {/* A propósito NO se le pasa a este formulario lo que calculó el
            sistema (resumen.porForma): un corte de caja en Paraguay es
            ciego — si el cajero viera el número de antemano, terminaría
            copiándolo en vez de contar de verdad, y el cierre dejaría de
            servir para detectar un error o un faltante. La comparación
            recién se muestra en el comprobante, después de confirmar. */}
        <CerrarTurnoForm
          turnoId={turno.id}
          cantidad={resumen.cantidad}
          totalGeneral={resumen.totalGeneral}
        />
      </Tarjeta>
    </div>
  );
}
