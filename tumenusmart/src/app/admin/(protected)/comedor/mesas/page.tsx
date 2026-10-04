import { pantallaConPermiso } from "@/lib/auth";
import { idLocalActual } from "@/lib/local-actual";
import { prismaDelLocal } from "@/lib/prisma-local";
import { BotonEnlace, Cabecera } from "@/components/ui";
import { PestanasConfigComedor } from "../PestanasConfigComedor";
import { GestorMesas } from "./GestorMesas";

export const dynamic = "force-dynamic";

/**
 * Las mesas del salón y sus sectores (Ajustes → Configuración servicio comedor → Mesas y sectores): el dueño arma los
 * sectores del restaurante (Salón, Patio, Terraza), carga las mesas de cada uno, y el mozo elige primero el sector y después
 * la mesa en vez de escribirla. Solo del dueño (comedor.configurar).
 */
export default async function MesasComedorPage() {
  await pantallaConPermiso("comedor.configurar");
  const db = prismaDelLocal(await idLocalActual());

  const [sectores, mesas, abiertas] = await Promise.all([
    db.sectorComedor.findMany({
      orderBy: [{ orden: "asc" }, { createdAt: "asc" }],
      select: { id: true, nombre: true },
    }),
    db.mesaComedor.findMany({
      orderBy: [{ orden: "asc" }, { createdAt: "asc" }],
      select: { id: true, nombre: true, activa: true, sectorId: true },
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
        titulo="Mesas y sectores"
        bajada="Armá los sectores del restaurante y cargá las mesas de cada uno: el mozo elige el sector y después la mesa, sin escribirla."
        acciones={
          <BotonEnlace href="/admin/comedor" tono="navegar" tam="md">
            Cuentas abiertas
          </BotonEnlace>
        }
      />
      <PestanasConfigComedor activa="mesas" />
      <GestorMesas sectores={sectores} mesas={mesas} mesasOcupadas={abiertas.map((c) => c.mesa)} />
    </div>
  );
}
