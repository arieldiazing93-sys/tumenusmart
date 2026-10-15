import { pantallaConPermiso } from "@/lib/auth";
import { idLocalActual } from "@/lib/local-actual";
import { prismaDelLocal } from "@/lib/prisma-local";
import { Cabecera } from "@/components/ui";
import { etiquetaDeDeporte, limpiarDuraciones, normalizarDeporte, normalizarPaso, type CanchaFila } from "@/lib/canchas";
import { cargarPreciosPorDia } from "@/lib/canchas-publicas";
import { normalizarIva } from "@/lib/iva";
import { prisma } from "@/lib/prisma";
import { ListaCanchas } from "./ListaCanchas";

export const dynamic = "force-dynamic";

/**
 * Las canchas del complejo: cada una con su tipo, su precio por hora (y el de la noche, si tiene), las duraciones que se
 * ofrecen y cada cuánto arranca un horario. Solo el dueño las arma.
 */
export default async function CanchasPage() {
  await pantallaConPermiso("canchas.configurar");
  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);

  const [filas, conReservas, grupos] = await Promise.all([
    db.cancha.findMany({
      // Las activas primero; entre ellas, en el orden en que se cargaron.
      orderBy: [{ activa: "desc" }, { orden: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    }),
    // Qué canchas ya tuvieron alguna reserva (una sola fila por cancha): esas no se pueden borrar, solo desactivar.
    db.reservaCancha.findMany({ distinct: ["canchaId"], select: { canchaId: true } }),
    // Los grupos de canchas del punto de venta (Fútbol 5, Pádel…): para sugerirlos al cargar otra cancha.
    db.category.findMany({ where: { paraCanchas: true }, orderBy: { orden: "asc" }, select: { id: true, nombre: true } }),
  ]);
  const idsConReservas = new Set(conReservas.map((r) => r.canchaId));
  // Los precios por día y horario de cada cancha (son los precios de promoción de su producto del punto de venta).
  const preciosPorDia = await cargarPreciosPorDia(
    prisma,
    storeId,
    filas.map((f) => ({ id: f.id, productId: f.productId }))
  );
  const nombreDelGrupo = new Map(grupos.map((g) => [g.id, g.nombre] as const));

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
    promos: preciosPorDia.get(f.id) ?? [],
    activa: f.activa,
    tieneReservas: idsConReservas.has(f.id),
    // Las canchas cargadas antes de los grupos quedan en el del tipo de cancha hasta que se guarden de nuevo.
    categoria: (f.categoriaId ? nombreDelGrupo.get(f.categoriaId) : undefined) ?? etiquetaDeDeporte(f.deporte),
    iva: normalizarIva(f.iva),
  }));

  return (
    <div className="flex flex-col gap-3">
      <Cabecera
        titulo="Canchas"
        bajada="Las canchas de tu complejo, con su precio por hora y las duraciones que ofrecés. Tus clientes las reservan desde tu página."
      />
      <ListaCanchas canchas={canchas} grupos={grupos.map((g) => g.nombre)} />
    </div>
  );
}
