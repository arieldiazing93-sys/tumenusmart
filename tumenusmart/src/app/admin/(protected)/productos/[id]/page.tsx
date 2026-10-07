import { notFound, redirect } from "next/navigation";
import { pantallaConPermiso } from "@/lib/auth";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";

export const dynamic = "force-dynamic";

/**
 * La ficha del producto ya no es una página aparte: se abre a la derecha de la
 * lista de Productos (igual que Insumos). Esta dirección queda para los enlaces
 * que ya existían (por ejemplo desde Grupos de agregados) y lleva a la lista con
 * la categoría y el producto ya elegidos.
 */
export default async function ProductoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ guardado?: string }>;
}) {
  await pantallaConPermiso("productos.editar");
  // Atado a este local: un producto de otro negocio no aparece.
  const prisma = prismaDelLocal(await idLocalActual());

  const { id } = await params;
  const { guardado } = await searchParams;

  const producto = await prisma.product.findUnique({ where: { id }, select: { categoryId: true } });
  if (!producto) notFound();

  const destino = new URLSearchParams({ categoria: producto.categoryId, producto: id });
  if (guardado === "1") destino.set("guardado", "1");
  redirect(`/admin/productos?${destino.toString()}`);
}
