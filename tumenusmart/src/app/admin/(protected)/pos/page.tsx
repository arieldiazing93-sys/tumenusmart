import { redirect } from "next/navigation";
import { pantallaConPermiso } from "@/lib/auth";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { turnoAbierto } from "./turno-actual";
import { PantallaVenta } from "./PantallaVenta";

export const dynamic = "force-dynamic";

export default async function PosPage() {
  await pantallaConPermiso("pos.vender");
  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);

  const turno = await turnoAbierto(db);
  if (!turno) redirect("/admin/pos/abrir");

  const categorias = await db.category.findMany({
    where: { activa: true },
    orderBy: { orden: "asc" },
    select: {
      id: true,
      nombre: true,
      productos: {
        where: { disponible: true },
        orderBy: { orden: "asc" },
        select: { id: true, nombre: true, precio: true },
      },
    },
  });

  const categoriasVenta = categorias
    .filter((c) => c.productos.length > 0)
    .map((c) => ({
      id: c.id,
      nombre: c.nombre,
      productos: c.productos.map((p) => ({ id: p.id, nombre: p.nombre, precio: Number(p.precio) })),
    }));

  return <PantallaVenta turnoId={turno.id} categorias={categoriasVenta} />;
}
