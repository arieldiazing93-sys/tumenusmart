import { notFound, redirect } from "next/navigation";
import { pantallaConPermiso } from "@/lib/auth";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";

export const dynamic = "force-dynamic";

/**
 * El horario de una categoría ya no es una página aparte: se ve y se edita en el
 * panel de la derecha de la lista de Categorías. Esta dirección queda para los
 * enlaces que ya existían y lleva a la lista con la categoría ya abierta.
 */
export default async function HorarioCategoriaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await pantallaConPermiso("categorias.editar");
  // Atado a este local: una categoría de otro negocio no aparece.
  const prisma = prismaDelLocal(await idLocalActual());

  const { id } = await params;
  const categoria = await prisma.category.findUnique({ where: { id }, select: { id: true } });
  if (!categoria) notFound();

  redirect(`/admin/categorias?${new URLSearchParams({ categoria: id }).toString()}`);
}
