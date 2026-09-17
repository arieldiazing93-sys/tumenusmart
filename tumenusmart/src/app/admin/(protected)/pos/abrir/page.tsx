import { redirect } from "next/navigation";
import { pantallaConPermiso } from "@/lib/auth";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { Tarjeta } from "@/components/ui";
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
    <div className="mx-auto max-w-sm">
      <div className="mb-6 text-center">
        <span
          aria-hidden="true"
          className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-brand-light text-2xl"
        >
          🧾
        </span>
        <h1 className="text-[1.3rem] font-semibold tracking-titular text-tinta">Abrir turno</h1>
        <p className="mt-1 text-[0.85rem] text-tinta-media">
          Antes de vender, declará con cuánto arrancás la caja.
        </p>
      </div>
      <Tarjeta className="shadow-sm">
        <AbrirTurnoForm />
      </Tarjeta>
    </div>
  );
}
