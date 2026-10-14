import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache, type ReactNode } from "react";
import { prisma } from "@/lib/prisma";
import { estaSuspendido } from "@/lib/local-por-slug";
import { horaDeMinutos, iniciales } from "@/lib/agenda";
import { formatearTelefonoPersonal } from "@/lib/agenda-personal";
import { etiquetaDeDeporte, textoDeCierre, textoDuracionCancha } from "@/lib/canchas";
import { cargarCanchasPublicas, cargarHorarioCanchas, disponibilidadDeCanchas } from "@/lib/canchas-publicas";
import { formatearGuarani } from "@/lib/format";
import { nombreDeDia, type HorarioDia } from "@/lib/horario-trabajo";
import { completarGaleria, normalizarTema } from "@/lib/pagina-reservas";
import { claveDiaAsuncion, diaSemanaAsuncion } from "@/lib/timezone";
import { construirLinkWhatsapp } from "@/lib/whatsapp";
import {
  IconoCorreo,
  IconoFacebook,
  IconoInstagram,
  IconoTelefono,
  IconoTiktok,
  IconoWhatsappLinea,
} from "@/components/IconosRedes";
import { CarruselGaleria } from "@/app/turnos/[slug]/CarruselGaleria";
import { CompartirBoton } from "@/app/turnos/[slug]/CompartirBoton";
import { IconoCalendario, IconoChevron, IconoReloj } from "@/app/turnos/[slug]/Iconos";
import { variablesDePagina } from "@/app/turnos/[slug]/marco";

export const dynamic = "force-dynamic";

/** Se busca una sola vez por visita, aunque la use la página y sus metadatos. */
const cargarPagina = cache(async (slug: string) => {
  return prisma.paginaCanchas.findUnique({
    where: { slug: slug.toLowerCase() },
    include: { store: { select: { estado: true, vencimiento: true } } },
  });
});

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const pagina = await cargarPagina(slug);
  if (!pagina || !pagina.habilitada) return { title: "Reservas" };
  return {
    title: `${pagina.nombre} — Reservá tu cancha`,
    description: pagina.descripcion || `Reservá tu cancha en ${pagina.nombre}.`,
  };
}

const SUMMARY =
  "flex cursor-pointer list-none items-center gap-2 px-4 py-4 text-[0.95rem] font-semibold text-tinta [&::-webkit-details-marker]:hidden";

/** Un botón de contacto: una píldora con su icono y su nombre al lado. */
type Contacto = { nombre: string; href: string; icono: ReactNode; externo: boolean; color: string };

/** "08:00 – 24:00", o "Cerrado". */
function textoDelDia(h: HorarioDia | undefined): string {
  if (!h || !h.trabaja) return "Cerrado";
  return `${h.inicio} – ${textoDeCierre(h.fin)}`;
}

/**
 * La página pública de un complejo deportivo. Es la misma página del negocio (foto, contacto, redes, galería, colores y
 * tema) pero armada para lo que busca quien quiere jugar: arriba, "Jugá hoy" con los próximos horarios libres de cada
 * cancha —tocar uno lleva derecho al tablero de reserva con ese horario ya elegido—, después las canchas con sus fotos y
 * precios, y el horario del complejo.
 *
 * Los colores salen del mismo mecanismo que el menú digital: la paleta del negocio y el tema (claro, oscuro o el del
 * celular) reescriben las variables de color solo acá adentro.
 */
export default async function PaginaPublicaCanchas({ params }: { params: Promise<{ slug: string }> }) {
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
            Por el momento no se pueden reservar canchas desde acá. Comunicate directamente con el complejo.
          </p>
        </main>
      </div>
    );
  }

  const ahora = new Date();
  const hoyClave = claveDiaAsuncion(ahora);
  const [horarios, canchas] = await Promise.all([
    cargarHorarioCanchas(prisma, pagina.storeId),
    cargarCanchasPublicas(prisma, pagina.storeId),
  ]);
  const hoy = horarios.find((h) => h.diaSemana === diaSemanaAsuncion());

  // "Jugá hoy": los próximos horarios libres de hoy de cada cancha, con la duración más corta que ofrece.
  const disponibilidad = canchas.length > 0 ? await disponibilidadDeCanchas(prisma, pagina.storeId, canchas, ahora) : null;
  const deHoy = canchas
    .map((c) => {
      const duracion = Math.min(...c.duraciones);
      const horas = disponibilidad?.get(c.id)?.[duracion]?.[hoyClave] ?? [];
      return { cancha: c, duracion, horas: horas.slice(0, 5), quedan: horas.length };
    })
    .filter((x) => x.horas.length > 0);

  const galeria = completarGaleria(pagina.galeria);

  const enlaceWhatsapp = pagina.whatsapp
    ? construirLinkWhatsapp(pagina.whatsapp, `Hola, quiero reservar una cancha en ${pagina.nombre}.`)
    : null;
  const contactos: Contacto[] = [];
  if (enlaceWhatsapp) {
    contactos.push({ nombre: "WhatsApp", href: enlaceWhatsapp, icono: <IconoWhatsappLinea tam={18} />, externo: true, color: "text-[#25D366]" });
  }
  if (pagina.telefono) {
    contactos.push({ nombre: "Llamar", href: `tel:+${pagina.telefono}`, icono: <IconoTelefono tam={18} />, externo: false, color: "text-brand-texto" });
  }
  if (pagina.email) {
    contactos.push({ nombre: "Correo", href: `mailto:${pagina.email}`, icono: <IconoCorreo tam={18} />, externo: false, color: "text-brand-texto" });
  }
  if (pagina.instagram) {
    contactos.push({ nombre: "Instagram", href: pagina.instagram, icono: <IconoInstagram tam={18} />, externo: true, color: "text-[#E1306C]" });
  }
  if (pagina.tiktok) {
    contactos.push({ nombre: "TikTok", href: pagina.tiktok, icono: <IconoTiktok tam={18} />, externo: true, color: "text-tinta" });
  }
  if (pagina.facebook) {
    contactos.push({ nombre: "Facebook", href: pagina.facebook, icono: <IconoFacebook tam={18} />, externo: true, color: "text-[#1877F2]" });
  }

  return (
    <div data-tema={tema} style={estilo} className="min-h-screen bg-papel-suave text-tinta">
      <main className="relative mx-auto min-h-screen w-full max-w-xl bg-papel pb-44 sm:shadow-alta">
        {/* ---------- portada: el color del negocio, con la foto de portada si hay ---------- */}
        <div className="relative h-52 overflow-hidden bg-gradient-to-br from-brand to-brand-dark sm:h-60">
          {pagina.bannerUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={pagina.bannerUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
          )}
          <span aria-hidden="true" className="absolute -right-8 -top-10 h-44 w-44 rounded-full border-[14px] border-white/10" />
          <span aria-hidden="true" className="absolute -bottom-16 left-1/2 h-40 w-40 -translate-x-1/2 rounded-full border-[14px] border-white/10" />
          <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/45 to-transparent" />
          <div className="absolute right-3 top-3">
            <CompartirBoton nombre={pagina.nombre} />
          </div>
          <div className="absolute inset-x-0 bottom-0 flex items-end gap-3.5 px-5 pb-4">
            <div className="flex h-20 w-20 flex-none items-center justify-center overflow-hidden rounded-2xl border-4 border-white/90 bg-brand-light text-[1.7rem] font-semibold text-brand-texto shadow-media">
              {pagina.fotoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={pagina.fotoUrl} alt={pagina.nombre} className="h-full w-full object-cover" />
              ) : (
                iniciales(pagina.nombre)
              )}
            </div>
            <div className="min-w-0 pb-0.5 text-white">
              <h1 className="text-[1.5rem] font-semibold leading-tight tracking-titular drop-shadow">{pagina.nombre}</h1>
              {pagina.industria && <p className="text-[0.9rem] text-white/85">{pagina.industria}</p>}
            </div>
          </div>
        </div>

        <div className="px-5">
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-light px-3 py-1.5 text-[0.82rem] font-semibold text-brand-texto">
              <IconoReloj tam={15} />
              {hoy?.trabaja ? `Hoy abre ${textoDelDia(hoy)}` : "Hoy está cerrado"}
            </span>
            {pagina.telefono && (
              <span className="cifra text-[0.85rem] text-tinta-suave">{formatearTelefonoPersonal(pagina.telefono)}</span>
            )}
          </div>

          {pagina.descripcion && (
            <p className="mt-4 whitespace-pre-line text-[0.95rem] leading-relaxed text-tinta-media">{pagina.descripcion}</p>
          )}

          {/* ---------- jugá hoy ---------- */}
          {canchas.length > 0 && (
            <section className="mt-6 rounded-3xl bg-brand-light/60 p-4 ring-1 ring-brand/15" aria-label="Jugá hoy">
              <h2 className="text-[1.1rem] font-semibold tracking-titular text-tinta">Jugá hoy</h2>
              {deHoy.length > 0 ? (
                <>
                  <p className="mb-3 text-[0.82rem] text-tinta-media">
                    Los próximos horarios libres. Tocá uno y queda elegido.
                  </p>
                  <ul className="flex flex-col gap-3">
                    {deHoy.map(({ cancha, duracion, horas, quedan }) => (
                      <li key={cancha.id}>
                        <p className="flex items-baseline justify-between gap-2 text-[0.88rem] font-semibold text-tinta">
                          <span className="truncate">{cancha.nombre}</span>
                          <span className="flex-none text-[0.74rem] font-normal text-tinta-suave">
                            {textoDuracionCancha(duracion)} · {quedan === 1 ? "queda 1" : `quedan ${quedan}`}
                          </span>
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-2">
                          {horas.map((h) => (
                            <Link
                              key={h}
                              href={`/canchas/${pagina.slug}/reservar?dia=${hoyClave}&cancha=${cancha.id}&hora=${horaDeMinutos(h)}`}
                              className="cifra rounded-xl bg-superficie px-3.5 py-2 text-[0.9rem] font-bold text-tinta shadow-sm ring-1 ring-linea transition-all hover:ring-brand active:scale-95"
                            >
                              {horaDeMinutos(h)}
                            </Link>
                          ))}
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="mt-1 text-[0.88rem] text-tinta-media">
                  Hoy ya no quedan horarios libres. Mirá los próximos días en el tablero de reservas.
                </p>
              )}
            </section>
          )}

          {/* ---------- las canchas ---------- */}
          <section className="mt-7" aria-label="Canchas">
            <h2 className="mb-3 text-[1.1rem] font-semibold tracking-titular text-tinta">Nuestras canchas</h2>
            {canchas.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-linea bg-papel-suave px-5 py-6 text-center text-[0.9rem] text-tinta-media">
                Todavía no hay canchas para reservar. Volvé en un rato o escribinos.
              </p>
            ) : (
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {canchas.map((c) => (
                  <li key={c.id} className="overflow-hidden rounded-2xl bg-superficie shadow-sm ring-1 ring-linea">
                    <div className="relative flex h-28 items-center justify-center bg-brand-light text-[2.2rem]">
                      {c.fotoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={c.fotoUrl} alt={c.nombre} className="h-full w-full object-cover" />
                      ) : (
                        <span aria-hidden="true">⚽</span>
                      )}
                      {c.techada && (
                        <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2.5 py-1 text-[0.68rem] font-semibold text-white">
                          Techada
                        </span>
                      )}
                    </div>
                    <div className="p-3.5">
                      <p className="truncate text-[1rem] font-semibold tracking-titular text-tinta">{c.nombre}</p>
                      <p className="truncate text-[0.8rem] text-tinta-media">
                        {[etiquetaDeDeporte(c.deporte), c.superficie].filter(Boolean).join(" · ")}
                      </p>
                      <p className="cifra mt-2 text-[0.95rem] font-bold text-tinta">
                        {formatearGuarani(c.precioHora)}
                        <span className="ml-1 text-[0.74rem] font-normal text-tinta-suave">por hora</span>
                      </p>
                      {c.precioNocturnoHora !== null && (
                        <p className="cifra text-[0.74rem] text-tinta-suave">
                          Desde las {c.nocheDesde}: {formatearGuarani(c.precioNocturnoHora)}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ---------- contacto y redes ---------- */}
          {contactos.length > 0 && (
            <ul className="mt-6 flex flex-wrap gap-2">
              {contactos.map((a) => (
                <li key={a.nombre}>
                  <a
                    href={a.href}
                    {...(a.externo ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                    className="inline-flex items-center gap-2 rounded-full bg-superficie px-3.5 py-2 text-[0.84rem] font-semibold text-tinta shadow-sm ring-1 ring-linea transition-all hover:ring-brand active:scale-95"
                  >
                    <span className={a.color}>{a.icono}</span>
                    {a.nombre}
                  </a>
                </li>
              ))}
            </ul>
          )}

          {/* ---------- horario ---------- */}
          <details className="group mt-6 rounded-2xl bg-superficie shadow-sm ring-1 ring-linea">
            <summary className={SUMMARY}>
              <span className="flex-1">Horario del complejo</span>
              <span className="cifra text-[0.8rem] font-medium text-tinta-media">Hoy {textoDelDia(hoy)}</span>
              <IconoChevron className="text-tinta-suave transition-transform duration-200 group-open:rotate-180" />
            </summary>
            <ul className="divide-y divide-linea-fina border-t border-linea px-4">
              {horarios.map((h) => {
                const esHoy = h.diaSemana === diaSemanaAsuncion();
                return (
                  <li
                    key={h.diaSemana}
                    className={`flex items-baseline justify-between gap-3 py-3 text-[0.9rem] ${
                      esHoy ? "font-semibold text-tinta" : "text-tinta-media"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      {nombreDeDia(h.diaSemana)}
                      {esHoy && (
                        <span className="rounded-full bg-brand-light px-2 py-0.5 text-[0.68rem] font-semibold text-brand-texto">Hoy</span>
                      )}
                    </span>
                    <span className="text-right">
                      <span className={`cifra ${h.trabaja ? "" : "text-tinta-suave"}`}>{textoDelDia(h)}</span>
                      {h.trabaja && h.descansa && (
                        <span className="cifra block text-[0.74rem] font-normal text-tinta-suave">
                          Cerrado {h.descansoInicio} – {h.descansoFin}
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </details>

          {/* ---------- galería ---------- */}
          {galeria.length > 0 && (
            <section className="mt-8" aria-label="Galería">
              <h2 className="mb-3 text-[1.1rem] font-semibold tracking-titular text-tinta">Galería</h2>
              <CarruselGaleria items={galeria} />
            </section>
          )}
        </div>

        {/* ---------- reservar: fijo abajo, flotando sobre un difuminado ---------- */}
        <div className="pointer-events-none fixed bottom-0 left-1/2 z-20 w-full max-w-xl -translate-x-1/2">
          <div aria-hidden="true" className="h-10 bg-gradient-to-t from-papel to-transparent" />
          <div className="pointer-events-auto bg-papel px-4 pb-3">
            {canchas.length > 0 ? (
              <Link
                href={`/canchas/${pagina.slug}/reservar`}
                className="flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl bg-brand text-[1rem] font-semibold text-white shadow-alta transition-all hover:bg-brand-dark active:scale-[0.98]"
              >
                <IconoCalendario tam={20} />
                Ver horarios y reservar
              </Link>
            ) : (
              <span className="flex h-14 w-full items-center justify-center rounded-2xl bg-papel-hundido text-[0.95rem] font-semibold text-tinta-suave">
                Sin canchas disponibles por ahora
              </span>
            )}
            <p className="mt-1 text-center">
              <Link
                href="/"
                className="-mr-[0.14em] inline-block py-1.5 font-mono text-[0.78rem] font-semibold uppercase leading-tight tracking-[0.14em] text-tinta-media transition-colors hover:text-tinta hover:underline"
              >
                Desarrollado por tumenusmart.com
              </Link>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
