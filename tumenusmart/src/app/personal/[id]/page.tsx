import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AvatarPersonal } from "@/app/admin/(protected)/agenda/AvatarPersonal";
import { AutoRefresh } from "@/components/AutoRefresh";
import { diaLargo, horaDeMinutos, partesLocales } from "@/lib/agenda";
import { claveSumarDias } from "@/lib/calendario";
import { formatearGuarani } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { claveDiaAsuncion, fechaAsuncionDesdeTexto, inicioDeMesEnAsuncion } from "@/lib/timezone";

export const dynamic = "force-dynamic";

// Es un enlace privado de cada persona: que no aparezca en los buscadores.
export const metadata: Metadata = {
  title: "Mi trabajo",
  robots: { index: false, follow: false },
};

/**
 * La vista de trabajo de una persona del personal (una barbera, un colorista…): las citas
 * que ya se cobraron a su nombre, o sea, las que quedaron confirmadas y le tocan. Es el
 * mismo criterio que la pantalla del repartidor (/repartidor/[id]): no hay usuario ni
 * contraseña; el enlace lleva el id de la persona (imposible de adivinar) y el dueño se
 * lo pasa por WhatsApp desde Personal.
 *
 * Solo lee, y todo queda atado al local de ESA persona: aunque el enlace circule, nunca
 * muestra citas de otro negocio ni de otra persona. Se actualiza sola cada medio minuto,
 * así una cita cobrada en la caja aparece acá sin recargar.
 */
export default async function TrabajoDelPersonalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const miembro = await prisma.miembroPersonal.findUnique({
    where: { id },
    select: { id: true, storeId: true, nombre: true, apellido: true, profesion: true, fotoUrl: true, activo: true },
  });
  // Quien ya no trabaja en el local (inactivo) deja de ver lo suyo con el mismo enlace.
  if (!miembro || !miembro.activo) notFound();
  const storeId = miembro.storeId;

  const ahora = new Date();
  const hoy = claveDiaAsuncion(ahora);
  const inicioSemana = fechaAsuncionDesdeTexto(claveSumarDias(hoy, -6)) as Date;
  const finHoy = fechaAsuncionDesdeTexto(claveSumarDias(hoy, 1)) as Date;
  const inicioMes = inicioDeMesEnAsuncion(ahora);
  const desde = inicioMes < inicioSemana ? inicioMes : inicioSemana;

  const [store, confirmadas] = await Promise.all([
    prisma.store.findUnique({ where: { id: storeId }, select: { nombre: true } }),
    prisma.cita.findMany({
      where: {
        storeId,
        personalId: id,
        // Confirmada = cobrada en la caja (y ese cobro no se anuló).
        ventaPos: { is: { cancelada: false } },
        inicio: { gte: desde, lt: finHoy },
      },
      orderBy: [{ inicio: "desc" }, { id: "asc" }],
      take: 400,
      select: {
        id: true,
        clienteNombre: true,
        inicio: true,
        serviciosTexto: true,
        ventaPos: { select: { total: true } },
      },
    }),
  ]);

  const trabajos = confirmadas.map((c) => {
    const { dia, minutos } = partesLocales(c.inicio);
    return {
      id: c.id,
      dia,
      hora: horaDeMinutos(minutos),
      cliente: c.clienteNombre,
      servicios: c.serviciosTexto,
      total: Number(c.ventaPos?.total ?? 0),
      inicio: c.inicio,
    };
  });

  const deHoy = trabajos.filter((t) => t.dia === hoy).sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
  const cantidadSemana = trabajos.filter((t) => t.inicio >= inicioSemana).length;
  const cantidadMes = trabajos.filter((t) => t.inicio >= inicioMes).length;

  // Los seis días anteriores a hoy que tuvieron trabajo, el más reciente primero.
  const anteriores = new Map<string, typeof trabajos>();
  for (const t of trabajos) {
    if (t.dia === hoy || t.inicio < inicioSemana) continue;
    anteriores.set(t.dia, [...(anteriores.get(t.dia) ?? []), t]);
  }

  const nombreNegocio = store?.nombre ?? "";
  const cifras = [
    { rotulo: "Hoy", valor: deHoy.length },
    { rotulo: "Últimos 7 días", valor: cantidadSemana },
    { rotulo: "Este mes", valor: cantidadMes },
  ];

  return (
    <main className="mx-auto min-h-screen max-w-md bg-superficie px-4 py-6">
      <AutoRefresh segundos={30} />

      <header className="flex items-center gap-3">
        <AvatarPersonal
          nombre={`${miembro.nombre} ${miembro.apellido ?? ""}`.trim()}
          fotoUrl={miembro.fotoUrl}
          className="h-14 w-14 text-[1.1rem]"
        />
        <div className="min-w-0">
          <h1 className="truncate text-[1.25rem] font-semibold tracking-titular text-tinta">Hola, {miembro.nombre} 👋</h1>
          <p className="truncate text-[0.85rem] text-tinta-media">
            {[miembro.profesion, nombreNegocio].filter(Boolean).join(" · ") || "Tu trabajo confirmado"}
          </p>
        </div>
      </header>

      <p className="mt-5 text-[0.9rem] text-tinta-media">
        {deHoy.length === 0
          ? "Todavía no tenés trabajos confirmados hoy. Cuando se cobre una cita tuya, aparece acá."
          : `Hoy tenés ${deHoy.length} ${deHoy.length === 1 ? "trabajo confirmado" : "trabajos confirmados"}.`}
      </p>

      <ul className="mt-3 grid grid-cols-3 gap-2">
        {cifras.map((c) => (
          <li key={c.rotulo} className="rounded-xl border border-linea bg-superficie px-3 py-3 text-center">
            <p className="cifra text-[1.5rem] font-semibold leading-none text-tinta">{c.valor}</p>
            <p className="mt-1.5 text-[0.7rem] font-medium text-tinta-suave">{c.rotulo}</p>
          </li>
        ))}
      </ul>

      {deHoy.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-[0.8rem] font-semibold uppercase tracking-wide text-tinta-suave">Hoy</h2>
          <ul className="flex flex-col gap-2">
            {deHoy.map((t) => (
              <li key={t.id} className="rounded-xl border border-linea border-l-4 border-l-exito bg-superficie p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[0.95rem] font-semibold text-tinta">{t.cliente}</p>
                    {t.servicios && <p className="text-[0.82rem] leading-snug text-tinta-media">{t.servicios}</p>}
                  </div>
                  <span className="cifra flex-none text-[0.85rem] text-tinta-suave">{t.hora}</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-[0.8rem]">
                  <span className="font-medium text-exito">✓ Confirmado</span>
                  <span className="cifra font-semibold text-tinta">{formatearGuarani(t.total)}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {anteriores.size > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-[0.8rem] font-semibold uppercase tracking-wide text-tinta-suave">Días anteriores</h2>
          <div className="flex flex-col gap-3">
            {[...anteriores.entries()].map(([dia, lista]) => (
              <div key={dia}>
                <p className="mb-1 text-[0.8rem] font-semibold text-tinta-media">{diaLargo(dia)}</p>
                <ul className="flex flex-col overflow-hidden rounded-xl border border-linea">
                  {lista.map((t) => (
                    <li
                      key={t.id}
                      className="flex items-center justify-between gap-3 border-b border-linea-fina bg-superficie px-3 py-2.5 text-[0.85rem] last:border-b-0"
                    >
                      <span className="min-w-0 truncate">
                        <span className="cifra text-tinta-suave">{t.hora}</span>{" "}
                        <span className="font-medium text-tinta">{t.cliente}</span>
                        {t.servicios && <span className="text-tinta-media"> · {t.servicios}</span>}
                      </span>
                      <span className="cifra flex-none font-semibold text-tinta">{formatearGuarani(t.total)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      <p className="mt-8 text-center text-[0.72rem] text-tinta-suave">Se actualiza sola. Solo ves lo tuyo.</p>
    </main>
  );
}
