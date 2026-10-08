import { pantallaConPermiso } from "@/lib/auth";
import { puede } from "@/lib/permisos";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { cargarPromociones } from "@/lib/promociones-servidor";
import Link from "next/link";
import { Cabecera, clasesBoton } from "@/components/ui";
import { PromocionesMaestroDetalle } from "./PromocionesMaestroDetalle";

export const dynamic = "force-dynamic";

/**
 * Promociones: descuentos ("PROMO 20 %") y promociones por volumen ("2 por 1": por cada 2, regalar 1) que rigen en ciertos días y horas
 * para un grupo de productos, en todos los canales de venta (mostrador, comedor, delivery y mozo). Las reglas están en
 * src/lib/promociones.ts; acá se crean y se editan.
 */
export default async function PromocionesPage() {
  // El empleado ve qué promociones hay, pero no las toca.
  const sesion = await pantallaConPermiso("productos.ver");
  const puedeEditar = puede(sesion.rol, "productos.editar");
  const puedeVerReporte = puede(sesion.rol, "estadisticas.ver");

  // Todas las consultas de acá abajo quedan atadas a este local.
  const db = prismaDelLocal(await idLocalActual());

  const promociones = await cargarPromociones(db, false);
  // Los productos para elegir solo hacen falta si la persona puede editar.
  const categorias = puedeEditar
    ? await db.category.findMany({
        orderBy: [{ orden: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          nombre: true,
          productos: {
            orderBy: [{ orden: "asc" }, { createdAt: "asc" }],
            select: { id: true, nombre: true, precio: true },
          },
        },
      })
    : [];

  return (
    <div>
      <Cabecera
        titulo="Promociones"
        bajada="Descuentos y promociones por volumen (“2 por 1”) que rigen en los días y horas que elijas, para los productos que elijas. Se aplican solas en el mostrador, el comedor, el delivery y la tablet del mozo."
        acciones={
          // Cuánto se descontó y se regaló con cada una: solo para quien puede ver las estadísticas.
          puedeVerReporte ? (
            <Link href="/admin/reporte-promociones" className={clasesBoton("navegar", "sm")}>
              Ver reporte
            </Link>
          ) : undefined
        }
      />

      <PromocionesMaestroDetalle
        promociones={promociones}
        categorias={categorias
          .filter((c) => c.productos.length > 0)
          .map((c) => ({
            id: c.id,
            nombre: c.nombre,
            productos: c.productos.map((p) => ({ id: p.id, nombre: p.nombre, precio: Number(p.precio) })),
          }))}
        puedeEditar={puedeEditar}
      />
    </div>
  );
}
