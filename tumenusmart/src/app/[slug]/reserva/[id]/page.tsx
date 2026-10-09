import { VolverAlMenu } from "@/components/Volver";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { construirMensajeReserva, construirLinkWhatsapp } from "@/lib/whatsapp";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import { etiquetaTurno, etiquetaMotivo } from "@/lib/reservas";
import { formatearNumero } from "@/lib/format";
import { Aviso } from "@/components/ui";
import { BotonWhatsappReserva } from "./BotonWhatsappReserva";
import { localPorSlug } from "@/lib/local-por-slug";

export const dynamic = "force-dynamic";

export default async function ConfirmacionReservaPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const store = await localPorSlug(slug);

  // La reserva se busca DENTRO de este local: el id de otro negocio no aparece.
  const reserva = await prisma.reservation.findFirst({
    where: { id, storeId: store.id },
  });

  if (!reserva) notFound();

  const fechaTexto = new Date(reserva.fecha).toLocaleDateString("es-PY", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: ZONA_NEGOCIO,
  });

  const saludo = store.mensajeSaludoReserva?.trim() || "Hola, te paso mi reserva:";

  const mensaje = construirMensajeReserva({
    numero: reserva.numero,
    saludo,
    clienteNombre: reserva.clienteNombre,
    clienteTelefono: reserva.clienteTelefono,
    clienteEmail: reserva.clienteEmail,
    fechaTexto,
    turnoTexto: etiquetaTurno(reserva.turno),
    horario: reserva.horario,
    personas: reserva.personas,
    motivoTexto: etiquetaMotivo(reserva.motivo),
  });

  const linkWhatsapp = construirLinkWhatsapp(store.whatsappNumero, mensaje);

  const filas: { etiqueta: string; valor: string }[] = [
    { etiqueta: "Personas", valor: String(reserva.personas) },
    { etiqueta: "Motivo", valor: etiquetaMotivo(reserva.motivo) },
    { etiqueta: "A nombre de", valor: reserva.clienteNombre },
  ];

  return (
    <main className="mx-auto max-w-2xl px-4 pb-10 pt-10">
      <div className="flex flex-col items-center text-center">
        <span
          aria-hidden="true"
          className="flex h-20 w-20 animate-[entradaExito_0.5s_cubic-bezier(0.22,0.7,0.3,1)_both] items-center justify-center rounded-full bg-brand text-white shadow-media ring-8 ring-brand-light"
        >
          <svg viewBox="0 0 24 24" width={34} height={34} fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </span>
        <h1 className="mt-5 text-[1.5rem] font-semibold tracking-titular text-tinta">
          Reserva {formatearNumero(reserva.numero)} generada
        </h1>
        {reserva.enviadoWhatsapp ? (
          <p className="mt-1.5 max-w-sm text-[0.92rem] leading-snug text-tinta-media">
            Ya le enviaste la reserva a {store.nombre}. Te van a confirmar por WhatsApp.
          </p>
        ) : (
          <div className="mt-4 w-full max-w-md text-left">
            <Aviso titulo="Todavía falta enviarla" color="aviso">
              La reserva se confirma recién cuando la mandás por WhatsApp — hasta entonces{" "}
              {store.nombre} no la ve.
            </Aviso>
          </div>
        )}
      </div>

      <div className="mx-auto mt-6 max-w-md">
        <BotonWhatsappReserva
          slug={slug}
          reservationId={reserva.id}
          link={linkWhatsapp}
          yaEnviado={reserva.enviadoWhatsapp}
        />
      </div>

      {/* Tu reserva, como un ticket: lo principal (cuándo) arriba y grande, y debajo el resto. */}
      <section aria-label="Tu reserva" className="mx-auto mt-6 max-w-md rounded-2xl bg-superficie p-5 shadow-sm ring-1 ring-linea">
        <p className="text-[0.74rem] font-semibold uppercase tracking-rotulo text-tinta-suave">Tu reserva</p>
        <p className="cifra mt-2 text-[1.35rem] font-semibold tracking-titular text-tinta">{fechaTexto}</p>
        <p className="cifra text-[1.05rem] font-semibold text-brand-texto">
          {reserva.horario} · {etiquetaTurno(reserva.turno)}
        </p>
        <div className="mt-4 flex flex-col gap-2.5 border-t border-dashed border-linea pt-4">
          {filas.map((f) => (
            <div key={f.etiqueta} className="flex justify-between gap-3 text-[0.92rem]">
              <span className="text-tinta-suave">{f.etiqueta}</span>
              <span className="text-right font-semibold text-tinta">{f.valor}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="mx-auto mt-6 max-w-md">
        <VolverAlMenu slug={slug} className="w-full justify-center !h-12 !rounded-2xl" />
      </div>
    </main>
  );
}
