import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { construirMensajeReserva, construirLinkWhatsapp } from "@/lib/whatsapp";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import { etiquetaTurno, etiquetaMotivo } from "@/lib/reservas";

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

  const mensaje = construirMensajeReserva({
    reservaId: reserva.id,
    saludo: store.mensajeSaludo,
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
        Reserva #{reserva.id.slice(-6).toUpperCase()} generada
      </h1>
      <p className="mb-8 text-neutral-600">
        Un último paso: enviá la reserva por WhatsApp para que {store.nombre} la confirme.
      </p>

      <a
        href={linkWhatsapp}
        target="_blank"
        rel="noopener noreferrer"
        className="mb-8 inline-flex items-center gap-2 rounded-lg bg-[#25D366] px-6 py-3 font-medium text-white hover:opacity-90"
      >
        Enviar por WhatsApp
      </a>

      <div className="rounded-lg border border-neutral-200 bg-white p-4 text-left text-sm text-neutral-700">
        <pre className="whitespace-pre-wrap font-sans">{mensaje}</pre>
      </div>

      <Link href="/" className="mt-8 inline-block text-sm text-brand">
        Volver al menú
      </Link>
    </main>
  );
}
