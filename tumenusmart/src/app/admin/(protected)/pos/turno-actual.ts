import type { PrismaLocal } from "@/lib/prisma-local";

/**
 * El turno de caja abierto del local, si hay uno.
 *
 * Es solo lectura (no Server Action): lo usan los `page.tsx` de venta,
 * apertura y cierre para decidir a dónde redirigir. Solo puede haber un
 * turno "abierto" por local a la vez.
 */
export async function turnoAbierto(db: PrismaLocal) {
  return db.turnoPos.findFirst({
    where: { estado: "abierto" },
    orderBy: { abiertoEn: "desc" },
  });
}
