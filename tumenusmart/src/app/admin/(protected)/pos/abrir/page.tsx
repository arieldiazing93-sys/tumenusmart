import { redirect } from "next/navigation";
import { pantallaConPermiso } from "@/lib/auth";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { estacionActual } from "@/lib/estacion-actual";
import { RUTA_TRAS_ABRIR_TURNO, rutaDeVueltaSegura } from "@/lib/turno-requerido";
import { Tarjeta } from "@/components/ui";
import { turnoAbierto } from "../turno-actual";
import { AbrirTurnoForm } from "./AbrirTurnoForm";
import { EstacionNoVinculada } from "../EstacionNoVinculada";

export const dynamic = "force-dynamic";

export default async function AbrirTurnoPage({
  searchParams,
}: {
  searchParams: Promise<{ volver?: string | string[] }>;
}) {
  await pantallaConPermiso("pos.vender");
  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);

  // De dónde viene la persona (un pedido, la cuenta de una mesa, la agenda): al abrir el turno vuelve ahí. Sin eso, al mostrador.
  const { volver } = await searchParams;
  const volverA = rutaDeVueltaSegura(Array.isArray(volver) ? volver[0] : volver);
  const vieneDeOtraPantalla = volverA !== RUTA_TRAS_ABRIR_TURNO;

  const estacion = await estacionActual(db);
  if (!estacion) return <EstacionNoVinculada />;

  // Un solo turno abierto por ESTA estación: si ya hay uno, no tiene sentido
  // abrir otro — se sigue donde estaba (o vendiendo en el mostrador).
  const turno = await turnoAbierto(db, estacion.id);
  if (turno) redirect(volverA);

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
        <p className="mt-0.5 text-[0.8rem] font-medium text-brand">Estación: {estacion.nombre}</p>
        {vieneDeOtraPantalla && (
          <p className="mt-2 rounded-lg bg-aviso-luz px-3 py-2 text-[0.8rem] font-medium text-aviso">
            Para cobrar hace falta el turno de caja abierto. Abrilo y volvés a donde estabas.
          </p>
        )}
      </div>
      <Tarjeta className="shadow-sm">
        <AbrirTurnoForm estacionId={estacion.id} volverA={volverA} />
      </Tarjeta>
    </div>
  );
}
