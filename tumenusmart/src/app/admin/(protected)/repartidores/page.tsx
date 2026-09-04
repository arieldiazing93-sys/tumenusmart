import { sesionActual } from "@/lib/auth";
import { puede } from "@/lib/permisos";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { RepartidorAcciones } from "./RepartidorAcciones";
import { CrearRepartidorForm } from "./CrearRepartidorForm";
import { LinkRepartidor } from "./LinkRepartidor";

export const dynamic = "force-dynamic";

export default async function AdminRepartidoresPage() {
  // El empleado necesita ver quién está disponible para asignar un pedido,
  // pero no da de alta ni borra repartidores.
  const sesion = await sesionActual();
  const puedeGestionar = puede(sesion?.rol, "repartidores.gestionar");

  // Todas las consultas de acá abajo quedan atadas a este local.
  const prisma = prismaDelLocal(await idLocalActual());

  const repartidores = await prisma.repartidor.findMany({
    orderBy: { createdAt: "asc" },
  });

  return (
    <div>
      <h1 className="mb-6 text-[1.4rem] font-semibold tracking-titular text-tinta">Repartidores</h1>

      {puedeGestionar && <CrearRepartidorForm />}

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
            {puedeGestionar && <RepartidorAcciones id={r.id} activo={r.activo} />}
          </div>
        ))}
        {repartidores.length === 0 && (
          <p className="text-sm text-tinta-suave">Todavía no cargaste ningún repartidor.</p>
        )}
      </div>
    </div>
  );
}
