import { AvatarPersonal } from "./AvatarPersonal";

/**
 * La franja de arriba del calendario: de quién es la agenda que se está
 * viendo. Con un miembro del personal elegido muestra su foto (o sus iniciales)
 * y su nombre; si no, dice que se ve a todos.
 */
export function BandaPersonal({
  nombre,
  fotoUrl,
  indice,
  cantidad,
}: {
  /** El miembro elegido, o null si se ve a todo el personal. */
  nombre: string | null;
  fotoUrl: string | null;
  /** Su posición en la lista (para darle su color de avatar). */
  indice: number;
  /** Cuántas personas hay en el personal. */
  cantidad: number;
}) {
  return (
    <div className="flex items-center justify-center gap-2.5 border-b border-linea bg-superficie px-3 py-2.5">
      {nombre ? (
        <>
          <AvatarPersonal nombre={nombre} fotoUrl={fotoUrl} indice={indice} className="h-8 w-8 text-[0.72rem]" />
          <span className="truncate text-[0.9rem] font-semibold text-tinta">{nombre}</span>
        </>
      ) : (
        <span className="truncate text-[0.9rem] font-semibold text-tinta">
          {cantidad === 0
            ? "Todavía no hay personal cargado"
            : cantidad === 1
              ? "Todo el personal (1 persona)"
              : `Todo el personal (${cantidad} personas)`}
        </span>
      )}
    </div>
  );
}
