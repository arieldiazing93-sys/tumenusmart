import { redirect } from "next/navigation";
import { pantallaConPermiso } from "@/lib/auth";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { estacionActual } from "@/lib/estacion-actual";
import { Cabecera, Tarjeta } from "@/components/ui";
import { resumirTurno } from "@/lib/turno-pos";
import { turnoAbierto, pedidosDelTurno } from "../turno-actual";
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

  // Un solo cierre: todo lo cobrado en este turno (mostrador, comedor y delivery: todos entran como una venta del Punto de Venta
  // cuando la caja cobra la cuenta). No hay rendición de repartidores: la plata del delivery entra al cobrar.
  const [ventas, pedidos] = await Promise.all([
    db.ventaPos.findMany({
      where: { turnoPosId: turno.id, cancelada: false },
      // Con el detalle de pagos: una venta con pago dividido suma en cada forma.
      select: { total: true, formaPago: true, pagos: { select: { forma: true, monto: true } } },
    }),
    pedidosDelTurno(db, turno.id),
  ]);
  const resumen = resumirTurno([
    ...ventas.map((v) => ({
      total: Number(v.total),
      formaPago: v.formaPago,
      pagos: v.pagos.map((p) => ({ forma: p.forma, monto: Number(p.monto) })),
    })),
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
      <Tarjeta className="max-w-lg shadow-sm !border-2 !border-azul/50">
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
