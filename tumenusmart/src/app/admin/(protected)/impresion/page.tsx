import { pantallaConPermiso } from "@/lib/auth";
import { idLocalActual } from "@/lib/local-actual";
import { estacionActual } from "@/lib/estacion-actual";
import { prismaDelLocal } from "@/lib/prisma-local";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import { Cabecera } from "@/components/ui";
import { RefrescarCada } from "@/components/RefrescarCada";
import { AgenteImpresion } from "./AgenteImpresion";
import { ListaTrabajos } from "./ListaTrabajos";

export const dynamic = "force-dynamic";

/**
 * Impresión automática: la pantalla que queda abierta en la computadora de la caja. Imprime, con las impresoras de ESTA
 * estación, las comandas que envían los mozos desde su celular o tablet (que no pueden imprimir por sí mismos), y muestra la
 * cola con el estado de cada una.
 */
export default async function ImpresionPage() {
  await pantallaConPermiso("comedor.gestionar");
  const db = prismaDelLocal(await idLocalActual());

  const estacion = await estacionActual(db);
  const [asignadas, trabajos] = await Promise.all([
    estacion
      ? db.estacionImpresora.findMany({
          where: { estacionId: estacion.id },
          select: { nombreImpresora: true, areaImpresion: { select: { nombre: true } } },
        })
      : Promise.resolve([]),
    db.trabajoImpresion.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { id: true, titulo: true, estado: true, createdAt: true, error: true },
    }),
  ]);

  return (
    <div className="flex flex-col gap-4">
      {/* Para que la lista de comandas se actualice sola; el motor de abajo sigue andando porque no se vuelve a montar. */}
      <RefrescarCada segundos={10} />
      <Cabecera
        titulo="Impresión automática"
        bajada="Esta computadora imprime las comandas que envían los mozos, con las impresoras de su estación."
      />

      <AgenteImpresion
        estacion={estacion?.nombre ?? null}
        asignaciones={asignadas.map((a) => ({ area: a.areaImpresion.nombre, impresora: a.nombreImpresora }))}
      />

      <section className="flex flex-col gap-2">
        <h2 className="text-[1rem] font-semibold tracking-titular text-tinta">Comandas</h2>
        <ListaTrabajos
          trabajos={trabajos.map((t) => ({
            id: t.id,
            titulo: t.titulo,
            estado: t.estado,
            error: t.error,
            hora: t.createdAt.toLocaleString("es-PY", {
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
              timeZone: ZONA_NEGOCIO,
            }),
          }))}
        />
      </section>
    </div>
  );
}
