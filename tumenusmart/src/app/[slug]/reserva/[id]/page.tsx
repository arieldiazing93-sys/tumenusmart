import { VolverAlMenu } from "@/components/Volver";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { construirMensajeReserva, construirLinkWhatsapp } from "@/lib/whatsapp";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import { etiquetaTurno, etiquetaMotivo } from "@/lib/reservas";
import { formatearNumero } from "@/lib/format";
import { Tarjeta, Aviso } from "@/components/ui";
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
    { etiqueta: "Fecha", valor: fechaTexto },
    { etiqueta: "Turno", valor: etiquetaTurno(reserva.turno) },
    { etiqueta: "Horario", valor: reserva.horario },
    { etiqueta: "Personas", valor: String(reserva.personas) },
    { etiqueta: "Motivo", valor: etiquetaMotivo(reserva.motivo) },
    { etiqueta: "A nombre de", valor: reserva.clienteNombre },
  ];

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 text-center">
      <div className="mb-6 animate-[entradaExito_0.4s_ease] text-5xl">📅</div>
      <h1 className="mb-2 text-[1.3rem] font-semibold tracking-titular text-tinta">
        Reserva {formatearNumero(reserva.numero)} generada
      </h1>
      {reserva.enviadoWhatsapp ? (
        <p className="mb-8 text-[0.9rem] text-tinta-media">
          Ya le enviaste la reserva a {store.nombre}. Te van a confirmar por WhatsApp.
        </p>
      ) : (
        <div className="mx-auto mb-8 max-w-md text-left">
          <Aviso titulo="Todavía falta enviarla" color="aviso">
            La reserva se confirma recién cuando la mandás por WhatsApp — hasta entonces{" "}
            {store.nombre} no la ve.
          </Aviso>
        </div>
      )}

      <div className="mb-8">
        <BotonWhatsappReserva
          slug={slug}
          reservationId={reserva.id}
          link={linkWhatsapp}
          yaEnviado={reserva.enviadoWhatsapp}
        />
      </div>

      <Tarjeta className="text-left">
        <p className="mb-3 text-[0.85rem] font-semibold text-tinta-media">Tu reserva</p>
        <div className="flex flex-col gap-2">
          {filas.map((f) => (
            <div key={f.etiqueta} className="flex justify-between gap-3 text-[0.88rem]">
              <span className="text-tinta-suave">{f.etiqueta}</span>
              <span className="font-medium text-tinta">{f.valor}</span>
            </div>
          ))}
        </div>
      </Tarjeta>

      <div className="mt-8">
        <VolverAlMenu slug={slug} />
      </div>
    </main>
  );
}
