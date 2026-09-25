import { AvatarPersonal } from "./AvatarPersonal";

/**
 * La franja de arriba del calendario cuando se está viendo la agenda de UNA persona:
 * su foto (o sus iniciales) y su nombre. Viendo a todo el personal no se muestra.
 */
export function BandaPersonal({
  nombre,
  fotoUrl,
  indice,
}: {
  nombre: string;
  fotoUrl: string | null;
  /** Su posición en la lista (para darle su color de avatar). */
  indice: number;
}) {
  return (
    <div className="flex items-center justify-center gap-2 border-b border-linea bg-superficie px-3 py-1.5">
      <AvatarPersonal nombre={nombre} fotoUrl={fotoUrl} indice={indice} className="h-6 w-6 text-[0.62rem]" />
      <span className="truncate text-[0.86rem] font-semibold text-tinta">{nombre}</span>
    </div>
  );
}
