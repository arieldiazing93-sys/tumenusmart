import Link from "next/link";
import type { IdeaGuardada } from "@/lib/idea-semanal";

const ETIQUETA: Record<IdeaGuardada["tipo"], string> = {
  alerta: "Atención",
  oportunidad: "Oportunidad",
  dato: "Para saber",
};

/**
 * La idea de la semana, mostrada arriba de Pedidos.
 *
 * Va acá y no en una pantalla aparte porque Pedidos es la única que el
 * encargado abre todos los días. Una idea guardada en una sección que nadie
 * visita no le sirve a nadie.
 */
export function TarjetaIdeaSemana({ idea }: { idea: IdeaGuardada }) {
  return (
    <Link
      href="/admin/analista"
      className="mb-4 block rounded-lg border border-brand/30 bg-orange-50/60 p-4 transition hover:border-brand/60 print:hidden"
    >
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-brand px-2 py-0.5 text-xs font-medium text-white">
          Tu idea de esta semana
        </span>
        {!idea.vista && (
          <span className="text-xs font-medium text-brand">Nueva</span>
        )}
        <span className="text-xs text-tinta-media">{ETIQUETA[idea.tipo]}</span>
      </div>

      <p className="font-semibold text-tinta">{idea.titulo}</p>
      <p className="mt-0.5 text-sm text-tinta-media">{idea.dato}</p>

      <span className="mt-2 inline-block text-sm font-medium text-brand">
        Ver qué hacer →
      </span>
    </Link>
  );
}
