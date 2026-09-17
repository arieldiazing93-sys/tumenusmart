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
        bajada="Contá la caja y declará cuánto tenés en cada forma de pago."
      />
      <Tarjeta className="max-w-lg">
        <CerrarTurnoForm
          turnoId={turno.id}
          cantidad={resumen.cantidad}
          totalGeneral={resumen.totalGeneral}
          porForma={resumen.porForma}
        />
      </Tarjeta>
    </div>
  );
}
