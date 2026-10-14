import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { aMinutos, esHoraValida } from "@/lib/horario-trabajo";
import { cargarCanchasPublicas } from "@/lib/canchas-publicas";
import { completarCampos, normalizarTema } from "@/lib/pagina-reservas";
import { prisma } from "@/lib/prisma";
import { cargarPaginaPublica } from "@/lib/reservas-publicas";
import { claveDiaAsuncion } from "@/lib/timezone";
import { variablesDePagina } from "@/app/turnos/[slug]/marco";
import { TableroReserva } from "./TableroReserva";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const pagina = await cargarPaginaPublica(slug);
  return { title: pagina ? `Reservar cancha — ${pagina.nombre}` : "Reservas" };
}

/**
 * La reserva de una cancha: un tablero con los días arriba y, por cada cancha, sus horarios libres. Esta página solo junta
 * lo que se ofrece (las canchas activas); los horarios se piden desde el tablero a medida que se mira, para que siempre
 * estén al día (una hora que alguien acaba de reservar tiene que desaparecer).
 *
 * Desde la portada se puede llegar con un horario ya tocado: `?dia=2026-10-16&cancha=<id>&hora=20:30`. Nada de eso se da
 * por bueno: el tablero solo lo deja elegido si ese horario sigue libre.
 */
export default async function ReservarCanchaPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ dia?: string; cancha?: string; hora?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const pagina = await cargarPaginaPublica(slug);
  if (!pagina) notFound();

  const canchas = await cargarCanchasPublicas(prisma, pagina.storeId);

  const dia = sp.dia && /^\d{4}-\d{2}-\d{2}$/.test(sp.dia) ? sp.dia : null;
  const canchaId = typeof sp.cancha === "string" && canchas.some((c) => c.id === sp.cancha) ? sp.cancha : null;
  const hora = sp.hora && esHoraValida(sp.hora) ? aMinutos(sp.hora) : null;

  return (
    <div
      data-tema={normalizarTema(pagina.tema)}
      style={variablesDePagina(pagina.colorPrimario)}
      className="min-h-screen bg-papel-suave text-tinta"
    >
      <TableroReserva
        slug={pagina.slug}
        negocio={pagina.nombre}
        canchas={canchas}
        campos={completarCampos(pagina.campos)}
        hoy={claveDiaAsuncion(new Date())}
        inicial={{ dia, canchaId, hora }}
      />
    </div>
  );
}
