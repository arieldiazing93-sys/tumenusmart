import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { estaSuspendido } from "@/lib/local-por-slug";
import { iniciales } from "@/lib/agenda";
import { formatearTelefonoPersonal } from "@/lib/agenda-personal";
import { completarHorario, nombreDeDia, type HorarioDia } from "@/lib/horario-trabajo";
import { completarGaleria, normalizarTema } from "@/lib/pagina-reservas";
import { diaSemanaAsuncion } from "@/lib/timezone";
import { construirLinkWhatsapp } from "@/lib/whatsapp";
import {
  IconoCorreo,
  IconoFacebook,
  IconoInstagram,
  IconoTelefono,
  IconoTiktok,
  IconoWhatsappLinea,
} from "@/components/IconosRedes";
import { CarruselGaleria } from "./CarruselGaleria";
import { CompartirBoton } from "./CompartirBoton";
import { variablesDePagina } from "./marco";

export const dynamic = "force-dynamic";

/** Se busca una sola vez por visita, aunque la use la página y sus metadatos. */
const cargarPagina = cache(async (slug: string) => {
  return prisma.paginaReservas.findUnique({
    where: { slug: slug.toLowerCase() },
    include: { store: { select: { estado: true, vencimiento: true } } },
  });
});

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const pagina = await cargarPagina(slug);
  if (!pagina || !pagina.habilitada) return { title: "Reservas" };
  return {
    title: `${pagina.nombre} — Reservá tu turno`,
    description: pagina.descripcion || `Reservá tu turno en ${pagina.nombre}.`,
  };
}

function Chevron() {
  return (
    <svg
      viewBox="0 0 24 24"
      width={18}
      height={18}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="flex-none text-tinta-suave transition-transform duration-200 group-open:rotate-180"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

const SUMMARY =
  "flex cursor-pointer list-none items-center gap-2 px-4 py-3.5 text-[0.92rem] font-semibold text-tinta [&::-webkit-details-marker]:hidden";

/** "09:00–20:00", o "Cerrado". */
function textoDelDia(h: HorarioDia | undefined): string {
  if (!h || !h.trabaja) return "Cerrado";
  return `${h.inicio} – ${h.fin}`;
}

/**
 * La página pública de reservas de un negocio de turnos: lo que ve el cliente
 * cuando abre el link. Foto y banner, nombre, contacto, redes, "Acerca de", el
 * horario, la galería y el botón para crear la cita.
 *
 * Los colores salen del mismo mecanismo que el menú digital: la paleta del
 * negocio y el tema (claro, oscuro o el del celular) reescriben las variables de
 * color solo acá adentro. Los textos usan siempre los tonos de tinta y papel, que
 * se invierten con el tema, así nunca se pierden al pasar de claro a oscuro.
 */
export default async function PaginaPublicaReservas({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const pagina = await cargarPagina(slug);
  if (!pagina) notFound();

  const tema = normalizarTema(pagina.tema);
  const estilo = variablesDePagina(pagina.colorPrimario);

  // Apagada por el dueño, o el negocio suspendido: el mensaje es neutro, sin mencionar pagos.
  if (!pagina.habilitada || estaSuspendido(pagina.store)) {
    return (
      <div data-tema={tema} style={estilo} className="min-h-screen bg-papel-suave text-tinta">
        <main className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-6 text-center">
          <div className="mb-4 text-4xl" aria-hidden="true">
            🕒
          </div>
          <h1 className="mb-2 text-[1.2rem] font-semibold tracking-titular text-tinta">
            Las reservas no están disponibles
          </h1>
          <p className="text-[0.9rem] text-tinta-media">
            Por el momento no se pueden reservar turnos desde acá. Comunicate directamente con el negocio.
          </p>
        </main>
      </div>
    );
  }

  const filasHorario = await prisma.horarioTrabajo.findMany({
    where: { storeId: pagina.storeId },
    select: {
      diaSemana: true,
      trabaja: true,
      inicio: true,
      fin: true,
      descansa: true,
      descansoInicio: true,
      descansoFin: true,
    },
  });
  const horarios = filasHorario.length > 0 ? completarHorario(filasHorario) : null;
  const hoy = horarios?.find((h) => h.diaSemana === diaSemanaAsuncion());

  const galeria = completarGaleria(pagina.galeria);

  const enlaceWhatsapp = pagina.whatsapp
    ? construirLinkWhatsapp(pagina.whatsapp, `Hola, quiero reservar un turno en ${pagina.nombre}.`)
    : null;
  const redes = [
    { nombre: "Instagram", enlace: pagina.instagram, icono: <IconoInstagram tam={20} /> },
    { nombre: "TikTok", enlace: pagina.tiktok, icono: <IconoTiktok tam={20} /> },
    { nombre: "Facebook", enlace: pagina.facebook, icono: <IconoFacebook tam={20} /> },
    {
      nombre: "WhatsApp",
      enlace: enlaceWhatsapp,
      icono: <IconoWhatsappLinea tam={20} />,
    },
  ].filter((r) => r.enlace);

  const CONTACTO =
    "flex h-10 w-10 items-center justify-center rounded-full border border-linea bg-superficie text-tinta-media transition-colors hover:border-brand hover:text-brand";

  return (
    <div data-tema={tema} style={estilo} className="min-h-screen bg-papel-suave text-tinta">
      <main className="relative mx-auto min-h-screen w-full max-w-xl bg-papel pb-32 sm:border-x sm:border-linea">
        {/* ---------- banner ---------- */}
        <div
          className="relative h-40 sm:h-48"
          style={{ backgroundImage: "linear-gradient(135deg, rgb(var(--brand)), rgb(var(--brand-dark)))" }}
        >
          {pagina.bannerUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={pagina.bannerUrl} alt="" className="h-full w-full object-cover" />
          )}
          <div className="absolute right-3 top-3">
            <CompartirBoton nombre={pagina.nombre} />
          </div>
        </div>

        <div className="px-5">
          {/* ---------- foto de perfil y contacto ---------- */}
          {/* El "relative z-10" es lo que la deja POR ENCIMA del banner: un elemento con
              posición (el banner lo es) se pinta sobre los que no la tienen, aunque vengan después. */}
          <div className="relative z-10 -mt-16 flex items-end justify-between gap-3 sm:-mt-[4.5rem]">
            <div className="flex h-32 w-32 flex-none items-center justify-center overflow-hidden rounded-full border-[5px] border-papel bg-brand-light text-[2.4rem] font-semibold text-brand-texto shadow-md sm:h-36 sm:w-36 sm:text-[2.7rem]">
              {pagina.fotoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={pagina.fotoUrl} alt={pagina.nombre} className="h-full w-full object-cover" />
              ) : (
                iniciales(pagina.nombre)
              )}
            </div>
            {/* Llamar y correo van acá; WhatsApp va una sola vez, con las redes. */}
            <div className="flex gap-2 pb-1">
              {pagina.telefono && (
                <a href={`tel:+${pagina.telefono}`} aria-label="Llamar" className={CONTACTO}>
                  <IconoTelefono tam={18} />
                </a>
              )}
              {pagina.email && (
                <a href={`mailto:${pagina.email}`} aria-label="Enviar un correo" className={CONTACTO}>
                  <IconoCorreo tam={18} />
                </a>
              )}
            </div>
          </div>

          <h1 className="mt-3 text-[1.4rem] font-semibold leading-tight tracking-titular text-tinta">{pagina.nombre}</h1>
          {pagina.industria && <p className="text-[0.92rem] text-tinta-media">{pagina.industria}</p>}
          {pagina.telefono && (
            <p className="cifra mt-1 text-[0.82rem] text-tinta-suave">{formatearTelefonoPersonal(pagina.telefono)}</p>
          )}

          {/* ---------- redes ---------- */}
          {redes.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-2.5">
              {redes.map((r) => (
                <li key={r.nombre}>
                  <a
                    href={r.enlace ?? undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={r.nombre}
                    title={r.nombre}
                    className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-light text-brand-texto transition-transform active:scale-95"
                  >
                    {r.icono}
                  </a>
                </li>
              ))}
            </ul>
          )}

          {/* ---------- acerca de y horario ---------- */}
          <div className="mt-5 flex flex-col gap-2.5">
            {pagina.descripcion && (
              <details className="group rounded-xl border border-linea bg-superficie" open>
                <summary className={SUMMARY}>
                  <span className="flex-1">Acerca de</span>
                  <Chevron />
                </summary>
                <p className="whitespace-pre-line border-t border-linea px-4 py-3.5 text-[0.9rem] leading-relaxed text-tinta-media">
                  {pagina.descripcion}
                </p>
              </details>
            )}

            {horarios && (
              <details className="group rounded-xl border border-linea bg-superficie">
                <summary className={SUMMARY}>
                  <span className="flex-1">Horario</span>
                  <span className="cifra text-[0.8rem] font-medium text-tinta-media">Hoy {textoDelDia(hoy)}</span>
                  <Chevron />
                </summary>
                <ul className="divide-y divide-linea-fina border-t border-linea px-4">
                  {horarios.map((h) => {
                    const esHoy = h.diaSemana === diaSemanaAsuncion();
                    return (
                      <li
                        key={h.diaSemana}
                        className={`flex items-baseline justify-between gap-3 py-2.5 text-[0.88rem] ${
                          esHoy ? "font-semibold text-tinta" : "text-tinta-media"
                        }`}
                      >
                        <span>{nombreDeDia(h.diaSemana)}</span>
                        <span className="text-right">
                          <span className={`cifra ${h.trabaja ? "" : "text-tinta-suave"}`}>{textoDelDia(h)}</span>
                          {h.trabaja && h.descansa && (
                            <span className="cifra block text-[0.74rem] font-normal text-tinta-suave">
                              Descanso {h.descansoInicio} – {h.descansoFin}
                            </span>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </details>
            )}
          </div>

          {/* ---------- galería ---------- */}
          {galeria.length > 0 && (
            <section className="mt-7" aria-label="Galería">
              <h2 className="mb-3 text-[1.05rem] font-semibold tracking-titular text-tinta">Galería</h2>
              <CarruselGaleria items={galeria} />
            </section>
          )}
        </div>

        {/* ---------- crear cita: fija abajo ---------- */}
        <div className="fixed bottom-0 left-1/2 z-20 w-full max-w-xl -translate-x-1/2 border-t border-linea bg-papel/95 backdrop-blur sm:border-x">
          <div className="px-5 pb-4 pt-3">
            <Link
              href={`/turnos/${pagina.slug}/reservar`}
              className="flex h-12 w-full items-center justify-center rounded-xl bg-brand text-[0.95rem] font-semibold text-white transition-colors hover:bg-brand-dark active:scale-[0.99]"
            >
              Crear cita
            </Link>
            <p className="mt-1.5 text-center text-[0.72rem] text-tinta-suave">
              <Link href="/" className="inline-block py-1 transition-colors hover:text-tinta hover:underline">
                Desarrollado por tumenusmart.com
              </Link>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
