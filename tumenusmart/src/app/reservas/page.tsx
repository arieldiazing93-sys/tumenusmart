import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { claveDiaAsuncion } from "@/lib/timezone";
import { ReservaForm } from "./ReservaForm";

export const dynamic = "force-dynamic";

export default async function ReservasPage() {
  const [store, horarios] = await Promise.all([
    prisma.store.findFirst(),
    prisma.horarioReserva.findMany({ where: { activo: true }, orderBy: { hora: "asc" } }),
  ]);

  const horariosPorTurno: Record<string, string[]> = { dia: [], tarde: [], noche: [] };
  for (const h of horarios) {
    if (horariosPorTurno[h.turno]) horariosPorTurno[h.turno].push(h.hora);
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Link href="/" className="mb-4 inline-block text-sm text-neutral-500 hover:text-brand">
        ← Volver al menú
      </Link>
      <h1 className="mb-1 text-xl font-bold text-neutral-900">Reservar mesa</h1>
      {store?.nombre && <p className="mb-6 text-sm text-neutral-500">{store.nombre}</p>}

      <ReservaForm horariosPorTurno={horariosPorTurno} hoy={claveDiaAsuncion(new Date())} />
    </main>
  );
}
