import Link from "next/link";
import { clasesBoton } from "@/components/ui";
import { AvatarPersonal } from "./AvatarPersonal";

/**
 * La franja de arriba del calendario cuando se está viendo la agenda de UNA persona:
 * su foto (o sus iniciales) y su nombre, y un botón a su vista de trabajo (las citas
 * que ya cobró). Viendo a todo el personal no se muestra.
 */
export function BandaPersonal({
  id,
  nombre,
  fotoUrl,
  indice,
}: {
  id: string;
  nombre: string;
  fotoUrl: string | null;
  /** Su posición en la lista (para darle su color de avatar). */
  indice: number;
}) {
  return (
    <div className="flex items-center gap-2 border-b border-linea bg-superficie px-3 py-1">
      <AvatarPersonal nombre={nombre} fotoUrl={fotoUrl} indice={indice} className="h-6 w-6 text-[0.62rem]" />
      <span className="min-w-0 flex-1 truncate text-[0.86rem] font-semibold text-tinta">{nombre}</span>
      <Link href={`/admin/agenda/citas?personal=${id}`} className={clasesBoton("navegar", "sm")}>
        Ver su trabajo
      </Link>
    </div>
  );
}
