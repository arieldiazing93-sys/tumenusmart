import Link from "next/link";
import { urlAgenda, type ParametrosAgenda } from "@/lib/agenda";
import { AvatarPersonal } from "./AvatarPersonal";
import { IconoEquipo } from "./IconosAgenda";

/**
 * La franja de arriba del calendario: de quién es la agenda que se está viendo, con
 * una pastilla por cada persona del personal. Tocar una la elige (el calendario pasa a
 * mostrar solo sus turnos) y "Todos" vuelve a mostrar a todo el equipo. La elegida
 * queda resaltada con su anillo de color; cada pastilla dice cuántos turnos tiene.
 */
export function BandaPersonal({
  personal,
  elegidoId,
  parametros,
  turnos,
}: {
  personal: { id: string; nombre: string; fotoUrl: string | null }[];
  /** El miembro elegido, o null si se ve a todo el personal. */
  elegidoId: string | null;
  parametros: ParametrosAgenda;
  /** Cuántos turnos tiene cada persona en el período; null si no se sabe (cuando se ve a una sola). */
  turnos: Record<string, number> | null;
}) {
  if (personal.length === 0) {
    return (
      <div className="border-b border-linea bg-papel-suave px-4 py-3 text-center text-[0.88rem] font-semibold text-tinta-media">
        Todavía no hay personal cargado
      </div>
    );
  }

  const PASTILLA =
    "flex flex-none items-center gap-2 rounded-full border-2 py-1 pl-1 pr-3 text-[0.82rem] font-semibold transition-all duration-200 hover:-translate-y-0.5 active:scale-95";
  const ELEGIDA = "border-brand bg-brand-light text-brand-texto shadow-md shadow-brand/20 ring-2 ring-brand/20";
  const REPOSO = "border-linea bg-superficie text-tinta-media hover:border-brand/50 hover:text-tinta";

  const total = turnos ? Object.values(turnos).reduce((suma, n) => suma + n, 0) : null;

  return (
    <div className="flex items-center gap-2 overflow-x-auto border-b border-linea bg-gradient-to-r from-papel-suave via-superficie to-papel-suave px-3 py-2.5">
      <Link
        href={urlAgenda(parametros, { personal: null })}
        scroll={false}
        aria-current={elegidoId === null ? "true" : undefined}
        className={`${PASTILLA} ${elegidoId === null ? ELEGIDA : REPOSO}`}
      >
        <span
          aria-hidden="true"
          className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-gradient-to-br from-brand to-brand-dark text-white ring-2 ring-white"
        >
          <IconoEquipo tam={15} />
        </span>
        Todo el equipo
        {total !== null && (
          <span className="rounded-full bg-brand px-1.5 text-[0.68rem] font-bold text-white">{total}</span>
        )}
      </Link>

      {personal.map((p, i) => {
        const elegido = p.id === elegidoId;
        const cantidad = turnos?.[p.id];
        return (
          <Link
            key={p.id}
            href={urlAgenda(parametros, { personal: p.id })}
            scroll={false}
            aria-current={elegido ? "true" : undefined}
            className={`${PASTILLA} ${elegido ? ELEGIDA : REPOSO}`}
          >
            <AvatarPersonal nombre={p.nombre} fotoUrl={p.fotoUrl} indice={i} className="h-7 w-7 text-[0.68rem] ring-2 ring-white" />
            <span className="max-w-[9rem] truncate">{p.nombre}</span>
            {cantidad !== undefined && (
              <span className="rounded-full bg-brand px-1.5 text-[0.68rem] font-bold text-white">{cantidad}</span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
