import { pantallaConPermiso } from "@/lib/auth";
import { idLocalActual } from "@/lib/local-actual";
import { prismaDelLocal } from "@/lib/prisma-local";
import { Cabecera } from "@/components/ui";
import { limpiarDuraciones, normalizarDeporte, normalizarPaso, type CanchaFila } from "@/lib/canchas";
import { ListaCanchas } from "./ListaCanchas";

export const dynamic = "force-dynamic";

/**
 * Las canchas del complejo: cada una con su tipo, su precio por hora (y el de la noche, si tiene), las duraciones que se
 * ofrecen y cada cuánto arranca un horario. Solo el dueño las arma.
 */
export default async function CanchasPage() {
  await pantallaConPermiso("canchas.configurar");
  const db = prismaDelLocal(await idLocalActual());

  const [filas, conReservas] = await Promise.all([
    db.cancha.findMany({
      // Las activas primero; entre ellas, en el orden en que se cargaron.
      orderBy: [{ activa: "desc" }, { orden: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    }),
    // Qué canchas ya tuvieron alguna reserva (una sola fila por cancha): esas no se pueden borrar, solo desactivar.
    db.reservaCancha.findMany({ distinct: ["canchaId"], select: { canchaId: true } }),
  ]);
  const idsConReservas = new Set(conReservas.map((r) => r.canchaId));

  const canchas: CanchaFila[] = filas.map((f) => ({
    id: f.id,
    nombre: f.nombre,
    deporte: normalizarDeporte(f.deporte),
    superficie: f.superficie,
    techada: f.techada,
    descripcion: f.descripcion,
    fotoUrl: f.fotoUrl,
    precioHora: Number(f.precioHora),
    precioNocturnoHora: f.precioNocturnoHora == null ? null : Number(f.precioNocturnoHora),
    nocheDesde: f.nocheDesde,
    duraciones: limpiarDuraciones(f.duraciones),
    pasoMin: normalizarPaso(f.pasoMin),
    activa: f.activa,
    tieneReservas: idsConReservas.has(f.id),
  }));

  return (
    <div className="flex flex-col gap-3">
      <Cabecera
        titulo="Canchas"
        bajada="Las canchas de tu complejo, con su precio por hora y las duraciones que ofrecés. Tus clientes las reservan desde tu página."
      />
      <ListaCanchas canchas={canchas} />
    </div>
  );
}
