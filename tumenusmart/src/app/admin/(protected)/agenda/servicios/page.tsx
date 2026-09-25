import { pantallaConPermiso } from "@/lib/auth";
import { idLocalActual } from "@/lib/local-actual";
import { prismaDelLocal } from "@/lib/prisma-local";
import { Cabecera } from "@/components/ui";
import { nombreCompleto } from "@/lib/agenda-personal";
import { normalizarTipoPrecio, type PersonalOpcion, type ServicioFila } from "@/lib/servicios-agenda";
import { GestorServicios } from "./GestorServicios";

export const dynamic = "force-dynamic";

/**
 * Los servicios de la Reserva de turnos (un corte, una barba, un color…),
 * agrupados por categoría. Solo el dueño los arma.
 *
 * Cada servicio es un producto marcado como servicio: se vende en el punto de
 * venta y se factura con su IVA, como "prestación de servicios" en la factura
 * electrónica. Acá se le suma lo de la agenda: duración, búfer, color y quién
 * lo realiza.
 */
export default async function ServiciosPage() {
  await pantallaConPermiso("agenda.configurar");
  const db = prismaDelLocal(await idLocalActual());

  const [categorias, filas, miembros] = await Promise.all([
    db.category.findMany({
      where: { paraServicios: true },
      orderBy: [{ orden: "asc" }, { createdAt: "asc" }],
      select: { id: true, nombre: true },
    }),
    db.servicioAgenda.findMany({
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        productId: true,
        duracionMin: true,
        bufferMin: true,
        tipoPrecio: true,
        color: true,
        product: { select: { nombre: true, precio: true, iva: true, disponible: true, categoryId: true } },
        personal: { select: { personalId: true } },
      },
    }),
    db.miembroPersonal.findMany({
      orderBy: [{ activo: "desc" }, { orden: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      select: { id: true, nombre: true, apellido: true, fotoUrl: true, activo: true },
    }),
  ]);

  const servicios: ServicioFila[] = filas.map((s) => ({
    id: s.id,
    productId: s.productId,
    categoryId: s.product.categoryId,
    nombre: s.product.nombre,
    precio: Number(s.product.precio),
    iva: s.product.iva,
    activo: s.product.disponible,
    duracionMin: s.duracionMin,
    bufferMin: s.bufferMin,
    tipoPrecio: normalizarTipoPrecio(s.tipoPrecio),
    color: s.color,
    personalIds: s.personal.map((p) => p.personalId),
  }));

  const personal: PersonalOpcion[] = miembros.map((m) => ({
    id: m.id,
    nombre: nombreCompleto(m),
    fotoUrl: m.fotoUrl,
    activo: m.activo,
  }));

  return (
    <div className="flex flex-col gap-3">
      <Cabecera
        titulo="Servicios"
        bajada="Lo que ofrecés a tus clientes, por categoría. Se venden en el punto de venta y se facturan con su IVA."
      />
      <GestorServicios categorias={categorias} servicios={servicios} personal={personal} />
    </div>
  );
}
