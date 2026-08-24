import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { claveDiaAsuncion, horaAsuncion } from "@/lib/timezone";
import { diasCerrados, NOMBRES_DIA } from "@/lib/horario-atencion";
import { ReservaForm } from "./ReservaForm";
import { localPorSlug } from "@/lib/local-por-slug";

export const dynamic = "force-dynamic";

export default async function ReservasPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const store = await localPorSlug(slug);

  const [horarios, horariosAtencion] = await Promise.all([
    prisma.horarioReserva.findMany({
      where: { storeId: store.id, activo: true },
      orderBy: { hora: "asc" },
    }),
    prisma.horarioAtencion.findMany({ where: { storeId: store.id } }),
  ]);

  const horariosPorTurno: Record<string, string[]> = { dia: [], tarde: [], noche: [] };
  for (const h of horarios) {
    if (horariosPorTurno[h.turno]) horariosPorTurno[h.turno].push(h.hora);
  }

  // Días en los que el local no abre: no se puede reservar mesa para esos días.
  const cerrados = diasCerrados(horariosAtencion);

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Link href={`/${slug}`} className="mb-4 inline-block text-sm text-neutral-500 hover:text-brand">
        ← Volver al menú
      </Link>
      <h1 className="mb-1 text-xl font-bold text-neutral-900">Reservar mesa</h1>
      <p className="mb-2 text-sm text-neutral-500">{store.nombre}</p>
      {cerrados.length > 0 && (
        <p className="mb-6 text-sm text-neutral-500">
          Cerramos los{" "}
          <strong>{cerrados.map((d) => NOMBRES_DIA[d]).join(", ")}</strong>.
        </p>
      )}

      <ReservaForm
        slug={slug}
        horariosPorTurno={horariosPorTurno}
        hoy={claveDiaAsuncion(new Date())}
        horaActual={horaAsuncion(new Date())}
        diasCerrados={cerrados}
        nombresDia={NOMBRES_DIA}
      />
    </main>
  );
}
