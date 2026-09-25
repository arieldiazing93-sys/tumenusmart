import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AvatarPersonal } from "@/app/admin/(protected)/agenda/AvatarPersonal";
import { AutoRefresh } from "@/components/AutoRefresh";
import { diaLargo, horaDeMinutos, partesLocales } from "@/lib/agenda";
import { montoDelTrabajo } from "@/lib/agenda-personal";
import { claveSumarDias } from "@/lib/calendario";
import { formatearGuarani } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { claveDiaAsuncion, fechaAsuncionDesdeTexto } from "@/lib/timezone";

export const dynamic = "force-dynamic";

/** Cuántos días adelante ve (contando hoy): la semana. */
const DIAS_QUE_VE = 7;

// Es un enlace privado de cada persona: que no aparezca en los buscadores.
export const metadata: Metadata = {
  title: "Mi trabajo",
  robots: { index: false, follow: false },
};

/**
 * La vista de trabajo de una persona del personal (una barbera, un colorista…): lo que tiene que hacer HOY y en
 * los próximos días de la semana, para que sepa qué le toca. Son las citas que ya se cobraron a su nombre, o sea,
 * las que quedaron confirmadas: si un cliente pagó su turno para dentro de dos o tres días, aparece en ese día.
 * Es el mismo criterio que la pantalla del repartidor (/repartidor/[id]): no hay usuario ni contraseña; el enlace
 * lleva el id de la persona (imposible de adivinar) y el dueño se lo pasa por WhatsApp desde Personal.
 *
 * Solo lee, y todo queda atado al local de ESA persona: aunque el enlace circule, nunca muestra citas de otro
 * negocio ni de otra persona. Se actualiza sola cada medio minuto, así una cita cobrada en la caja aparece acá sin
 * recargar. Lo de días pasados no se muestra: es una vista de lo que hay que hacer, no un historial.
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

  const hoy = claveDiaAsuncion(new Date());
  const manana = claveSumarDias(hoy, 1);
  const inicioHoy = fechaAsuncionDesdeTexto(hoy) as Date;
  const finSemana = fechaAsuncionDesdeTexto(claveSumarDias(hoy, DIAS_QUE_VE)) as Date;

  const [store, confirmadas] = await Promise.all([
    prisma.store.findUnique({ where: { id: storeId }, select: { nombre: true } }),
    prisma.cita.findMany({
      where: {
        storeId,
        personalId: id,
        // Confirmada = cobrada en la caja (y ese cobro no se anuló).
        ventaPos: { is: { cancelada: false } },
        // Desde el comienzo de hoy hasta el final del séptimo día.
        inicio: { gte: inicioHoy, lt: finSemana },
      },
      orderBy: [{ inicio: "asc" }, { id: "asc" }],
      take: 400,
      select: {
        id: true,
        clienteNombre: true,
        inicio: true,
        serviciosTexto: true,
        // Lo que valen sus servicios (sin los productos que se haya llevado el cliente en la misma cuenta).
        precio: true,
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
      total: montoDelTrabajo(c.precio, c.ventaPos?.total),
    };
  });

  const deHoy = trabajos.filter((t) => t.dia === hoy);
  // Los días que siguen, en orden, cada uno con sus trabajos (ya vienen ordenados por hora).
  const proximos = new Map<string, typeof trabajos>();
  for (const t of trabajos) {
    if (t.dia === hoy) continue;
    proximos.set(t.dia, [...(proximos.get(t.dia) ?? []), t]);
  }
  const cantidadProximos = trabajos.length - deHoy.length;
  const deManana = proximos.get(manana)?.length ?? 0;

  const nombreNegocio = store?.nombre ?? "";
  const cifras = [
    { rotulo: "Hoy", valor: deHoy.length },
    { rotulo: "Mañana", valor: deManana },
    { rotulo: "Esta semana", valor: trabajos.length },
  ];

  const plural = (n: number) => (n === 1 ? "trabajo confirmado" : "trabajos confirmados");
  const mensaje =
    deHoy.length > 0
      ? `Hoy tenés ${deHoy.length} ${plural(deHoy.length)}.${
          cantidadProximos > 0 ? ` Y ${cantidadProximos} más en los próximos días.` : ""
        }`
      : cantidadProximos > 0
        ? `Hoy no tenés trabajos confirmados. En los próximos días tenés ${cantidadProximos}.`
        : "Todavía no tenés trabajos confirmados. Cuando se cobre una cita tuya, aparece acá.";

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

      <p className="mt-5 text-[0.9rem] text-tinta-media">{mensaje}</p>

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

      {proximos.size > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-[0.8rem] font-semibold uppercase tracking-wide text-tinta-suave">Próximos días</h2>
          <div className="flex flex-col gap-3">
            {[...proximos.entries()].map(([dia, lista]) => (
              <div key={dia}>
                <p className="mb-1 text-[0.8rem] font-semibold text-tinta-media">
                  {dia === manana ? `Mañana · ${diaLargo(dia)}` : diaLargo(dia)}
                </p>
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
