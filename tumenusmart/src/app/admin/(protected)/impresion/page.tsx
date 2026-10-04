import { pantallaConPermiso } from "@/lib/auth";
import { idLocalActual } from "@/lib/local-actual";
import { estacionActual } from "@/lib/estacion-actual";
import { prismaDelLocal } from "@/lib/prisma-local";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import { comandaLegible } from "@/lib/comedor";
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
  const [asignadas, trabajos, enEspera] = await Promise.all([
    // Sin estación vinculada no hay impresoras que mostrar: se busca con un id que no existe y vuelve vacío.
    db.estacionImpresora.findMany({
      where: { estacionId: estacion?.id ?? "sin-estacion" },
      select: { areaImpresionId: true, nombreImpresora: true, areaImpresion: { select: { nombre: true } } },
    }),
    db.trabajoImpresion.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { id: true, titulo: true, estado: true, createdAt: true, error: true, contenido: true },
    }),
    // Lo que está esperando, por área: si hay comandas esperando un área que ESTA estación no tiene asignada a ninguna
    // impresora, nunca van a salir por más que todo lo demás esté en verde. Es la causa más fácil de pasar por alto.
    db.trabajoImpresion.groupBy({
      by: ["areaImpresionId"],
      where: { estado: "pendiente" },
      _count: { _all: true },
    }),
  ]);

  const areasConImpresora = new Set(asignadas.map((a) => a.areaImpresionId));
  const idsSinImpresora = enEspera
    .filter((g): g is typeof g & { areaImpresionId: string } => !!g.areaImpresionId && !areasConImpresora.has(g.areaImpresionId))
    .map((g) => g.areaImpresionId);
  const nombresDeAreas = idsSinImpresora.length
    ? await db.areaImpresion.findMany({ where: { id: { in: idsSinImpresora } }, select: { id: true, nombre: true } })
    : [];
  const nombreDeArea = new Map(nombresDeAreas.map((a) => [a.id, a.nombre]));
  const comandasSinImpresora = enEspera
    .filter((g): g is typeof g & { areaImpresionId: string } => !!g.areaImpresionId && idsSinImpresora.includes(g.areaImpresionId))
    .map((g) => ({ area: nombreDeArea.get(g.areaImpresionId) ?? "un área", cantidad: g._count._all }));

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
        comandasSinImpresora={comandasSinImpresora}
      />

      <section className="flex flex-col gap-2">
        <h2 className="text-[1rem] font-semibold tracking-titular text-tinta">Comandas</h2>
        <ListaTrabajos
          trabajos={trabajos.map((t) => ({
            id: t.id,
            titulo: t.titulo,
            estado: t.estado,
            error: t.error,
            texto: comandaLegible(t.contenido),
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
