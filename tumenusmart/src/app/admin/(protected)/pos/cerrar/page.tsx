import { redirect } from "next/navigation";
import { pantallaConPermiso } from "@/lib/auth";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { Cabecera, Tarjeta } from "@/components/ui";
import { resumirTurno } from "@/lib/turno-pos";
import { turnoAbierto, pedidosDelTurno } from "../turno-actual";
import { CerrarTurnoForm } from "./CerrarTurnoForm";

export const dynamic = "force-dynamic";

export default async function CerrarTurnoPage() {
  await pantallaConPermiso("pos.vender");
  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);

  const turno = await turnoAbierto(db);
  if (!turno) redirect("/admin/pos/abrir");

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
