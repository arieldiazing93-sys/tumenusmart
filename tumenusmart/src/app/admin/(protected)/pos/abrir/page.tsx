import { redirect } from "next/navigation";
import { pantallaConPermiso } from "@/lib/auth";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { Cabecera, Tarjeta } from "@/components/ui";
import { turnoAbierto } from "../turno-actual";
import { AbrirTurnoForm } from "./AbrirTurnoForm";

export const dynamic = "force-dynamic";

export default async function AbrirTurnoPage() {
  await pantallaConPermiso("pos.vender");
  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);

  // Un solo turno abierto por local: si ya hay uno, no tiene sentido abrir
  // otro — se sigue vendiendo en el que está.
  const turno = await turnoAbierto(db);
  if (turno) redirect("/admin/pos");

  return (
    <div>
      <Cabecera titulo="Abrir turno" bajada="Antes de vender, declará con cuánto arrancás la caja." />
      <Tarjeta className="max-w-sm">
        <AbrirTurnoForm />
      </Tarjeta>
    </div>
  );
}
