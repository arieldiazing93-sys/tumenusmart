import { pantallaConPermiso } from "@/lib/auth";
import { idLocalActual } from "@/lib/local-actual";
import { prismaDelLocal } from "@/lib/prisma-local";
import { BotonEnlace, Cabecera } from "@/components/ui";
import { PestanasConfigComedor } from "../PestanasConfigComedor";
import { GestorMesas } from "./GestorMesas";

export const dynamic = "force-dynamic";

/**
 * Las mesas del salón (Ajustes → Configuración servicio comedor → Mesas del salón): el dueño carga cuántas mesas tiene y el
 * mozo las elige de una lista en vez de escribirlas. Solo del dueño (comedor.configurar).
 */
export default async function MesasComedorPage() {
  await pantallaConPermiso("comedor.configurar");
  const db = prismaDelLocal(await idLocalActual());

  const [mesas, abiertas] = await Promise.all([
    db.mesaComedor.findMany({
      orderBy: [{ orden: "asc" }, { createdAt: "asc" }],
      select: { id: true, nombre: true, activa: true },
    }),
    // Las cuentas abiertas ahora, para avisar cuando se desactiva o se borra una mesa que está ocupada.
    db.cuentaMesa.findMany({
      where: { estado: { in: ["abierta", "por_cobrar"] } },
      select: { mesa: true },
    }),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <Cabecera
        titulo="Mesas del salón"
        bajada="Cargá las mesas que tiene el local: el mozo las elige de una lista y no tiene que escribirlas."
        acciones={
          <BotonEnlace href="/admin/comedor" tono="navegar" tam="md">
            Cuentas abiertas
          </BotonEnlace>
        }
      />
      <PestanasConfigComedor activa="mesas" />
      <GestorMesas mesas={mesas} mesasOcupadas={abiertas.map((c) => c.mesa)} />
    </div>
  );
}
