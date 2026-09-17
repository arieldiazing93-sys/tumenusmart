import { redirect } from "next/navigation";
import { pantallaConPermiso } from "@/lib/auth";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { Cabecera, Tarjeta } from "@/components/ui";
import { resumirTurno } from "@/lib/turno-pos";
import { turnoAbierto } from "../turno-actual";
import { CerrarTurnoForm } from "./CerrarTurnoForm";

export const dynamic = "force-dynamic";

export default async function CerrarTurnoPage() {
  await pantallaConPermiso("pos.vender");
  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);

  const turno = await turnoAbierto(db);
  if (!turno) redirect("/admin/pos/abrir");

  const ventas = await db.ventaPos.findMany({
    where: { turnoPosId: turno.id },
    select: { total: true, formaPago: true },
  });
  const resumen = resumirTurno(ventas.map((v) => ({ total: Number(v.total), formaPago: v.formaPago })));

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
