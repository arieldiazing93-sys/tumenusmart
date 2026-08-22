import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { construirMensajeReserva, construirLinkWhatsapp } from "@/lib/whatsapp";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import { etiquetaTurno, etiquetaMotivo } from "@/lib/reservas";
import { formatearNumero } from "@/lib/format";
import { BotonWhatsappReserva } from "./BotonWhatsappReserva";

export const dynamic = "force-dynamic";

export default async function ConfirmacionReservaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [reserva, store] = await Promise.all([
    prisma.reservation.findUnique({ where: { id } }),
    prisma.store.findFirst(),
  ]);

  if (!reserva || !store) notFound();

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

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 text-center">
      <div className="mb-6 text-5xl">📅</div>
      <h1 className="mb-2 text-xl font-bold text-neutral-900">
        Reserva {formatearNumero(reserva.numero)} generada
      </h1>
      {reserva.enviadoWhatsapp ? (
        <p className="mb-8 text-neutral-600">
          Ya le enviaste la reserva a {store.nombre}. Te van a confirmar por WhatsApp.
        </p>
      ) : (
        <div className="mx-auto mb-8 max-w-md rounded-xl border border-amber-300 bg-amber-50 p-4">
          <p className="font-semibold text-amber-900">Todavía falta enviarla</p>
          <p className="mt-0.5 text-sm text-amber-800">
            La reserva se confirma recién cuando la mandás por WhatsApp — hasta entonces{" "}
            {store.nombre} no la ve.
          </p>
        </div>
      )}

      <div className="mb-8">
        <BotonWhatsappReserva
          reservationId={reserva.id}
          link={linkWhatsapp}
          yaEnviado={reserva.enviadoWhatsapp}
        />
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white p-4 text-left text-sm text-neutral-700">
        <pre className="whitespace-pre-wrap font-sans">{mensaje}</pre>
      </div>

      <Link href="/" className="mt-8 inline-block text-sm text-brand">
        Volver al menú
      </Link>
    </main>
  );
}
