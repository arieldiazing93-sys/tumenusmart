import { clasesBoton } from "@/components/ui";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { crearRepartidor } from "./actions";
import { RepartidorAcciones } from "./RepartidorAcciones";
import { LinkRepartidor } from "./LinkRepartidor";

export const dynamic = "force-dynamic";

export default async function AdminRepartidoresPage() {
  // Todas las consultas de acá abajo quedan atadas a este local.
  const prisma = prismaDelLocal(await idLocalActual());

  const repartidores = await prisma.repartidor.findMany({
    orderBy: { createdAt: "asc" },
  });

  return (
    <div>
      <h1 className="mb-6 text-[1.4rem] font-semibold tracking-titular text-tinta">Repartidores</h1>

      <form action={crearRepartidor} className="mb-6 flex flex-wrap gap-2">
        <input
          name="nombre"
          required
          placeholder="Nombre"
          className="min-w-[160px] flex-1 rounded-lg border border-linea px-3 py-2"
        />
        <input
          name="telefono"
          placeholder="Teléfono (opcional)"
          className="min-w-[160px] flex-1 rounded-lg border border-linea px-3 py-2"
        />
        <button
          type="submit"
          className={clasesBoton("principal")}
        >
          Agregar
        </button>
      </form>

      <div className="flex flex-col gap-2">
        {repartidores.map((r) => (
          <div
            key={r.id}
            className="flex items-center justify-between rounded-lg border border-linea bg-white px-4 py-3"
          >
            <div>
              <p className="font-medium">{r.nombre}</p>
              {r.telefono && <p className="text-sm text-tinta-media">{r.telefono}</p>}
              <LinkRepartidor id={r.id} />
            </div>
            <RepartidorAcciones id={r.id} activo={r.activo} />
          </div>
        ))}
        {repartidores.length === 0 && (
          <p className="text-sm text-tinta-suave">Todavía no cargaste ningún repartidor.</p>
        )}
      </div>
    </div>
  );
}
