import { notFound, redirect } from "next/navigation";
import { pantallaConPermiso } from "@/lib/auth";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";

export const dynamic = "force-dynamic";

/**
 * El grupo ya no es una página aparte: se abre a la derecha de la lista de
 * Grupos de agregados (igual que Insumos y Productos). Esta dirección queda para
 * los enlaces que ya existían y lleva a la lista con el grupo ya abierto.
 */
export default async function GrupoAgregadoDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await pantallaConPermiso("productos.editar");
  // Atado a este local: un grupo de otro negocio no aparece.
  const prisma = prismaDelLocal(await idLocalActual());

  const { id } = await params;
  const grupo = await prisma.optionGroup.findUnique({ where: { id }, select: { id: true } });
  if (!grupo) notFound();

  redirect(`/admin/grupos-agregados?${new URLSearchParams({ grupo: id }).toString()}`);
}
