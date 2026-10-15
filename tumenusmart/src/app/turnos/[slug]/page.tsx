import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache, type ReactNode } from "react";
import { prisma } from "@/lib/prisma";
import { estaSuspendido } from "@/lib/local-por-slug";
import { iniciales } from "@/lib/agenda";
import { formatearTelefonoPersonal } from "@/lib/agenda-personal";
import { horarioDelNegocio, nombreDeDia, type HorarioDia } from "@/lib/horario-trabajo";
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
import { MapaUbicacion } from "@/components/MapaUbicacion";
import { CarruselGaleria } from "./CarruselGaleria";
import { CompartirBoton } from "./CompartirBoton";
import { IconoCalendario, IconoChevron, IconoReloj } from "./Iconos";
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
  return <IconoChevron className="text-tinta-suave transition-transform duration-200 group-open:rotate-180" />;
}

const SUMMARY =
  "flex cursor-pointer list-none items-center gap-2 px-4 py-4 text-[0.95rem] font-semibold text-tinta [&::-webkit-details-marker]:hidden";

/** Un botón de la fila de contacto: el círculo con su icono y, abajo, qué hace. */
type Accion = { nombre: string; href: string; icono: ReactNode; externo: boolean; color: string };

/** "09:00–20:00", o "Cerrado". */
function textoDelDia(h: HorarioDia | undefined): string {
  if (!h || !h.trabaja) return "Cerrado";
  return `${h.inicio} – ${h.fin}`;
}

/**
 * La página pública de reservas de un negocio de turnos: lo que ve el cliente
 * cuando abre el link. Foto de perfil (grande y centrada), nombre, contacto, redes, "Acerca de", el
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

  const columnasDeHorario = {
    diaSemana: true,
    trabaja: true,
    inicio: true,
    fin: true,
    descansa: true,
    descansoInicio: true,
    descansoFin: true,
  } as const;
  const [filasHorario, filasPropias, personalActivo] = await Promise.all([
    prisma.horarioTrabajo.findMany({ where: { storeId: pagina.storeId }, select: columnasDeHorario }),
    prisma.horarioPersonal.findMany({
      where: { storeId: pagina.storeId, personal: { activo: true } },
      select: { personalId: true, ...columnasDeHorario },
    }),
    prisma.miembroPersonal.findMany({ where: { storeId: pagina.storeId, activo: true }, select: { id: true } }),
  ]);
  const propioDe = new Map<string, HorarioDia[]>();
  for (const { personalId, ...dia } of filasPropias) {
    const lista = propioDe.get(personalId) ?? [];
    lista.push(dia);
    propioDe.set(personalId, lista);
  }
  // El horario del negocio es el de todo el personal junto (cada uno con el suyo o con el general).
  const horarios = horarioDelNegocio(
    filasHorario,
    propioDe,
    personalActivo.map((p) => p.id)
  );
  const hoy = horarios?.find((h) => h.diaSemana === diaSemanaAsuncion());

  const galeria = completarGaleria(pagina.galeria);

  const enlaceWhatsapp = pagina.whatsapp
    ? construirLinkWhatsapp(pagina.whatsapp, `Hola, quiero reservar un turno en ${pagina.nombre}.`)
    : null;

  // Los contactos y las redes, en una sola línea debajo del nombre, cada uno con el color de su plataforma.
  const acciones: Accion[] = [];
  if (enlaceWhatsapp) {
    acciones.push({ nombre: "WhatsApp", href: enlaceWhatsapp, icono: <IconoWhatsappLinea tam={18} />, externo: true, color: "text-[#25D366]" });
  }
  if (pagina.telefono) {
    acciones.push({ nombre: "Llamar", href: `tel:+${pagina.telefono}`, icono: <IconoTelefono tam={18} />, externo: false, color: "text-brand-texto" });
  }
  if (pagina.email) {
    acciones.push({ nombre: "Correo", href: `mailto:${pagina.email}`, icono: <IconoCorreo tam={18} />, externo: false, color: "text-brand-texto" });
  }
  if (pagina.instagram) {
    acciones.push({ nombre: "Instagram", href: pagina.instagram, icono: <IconoInstagram tam={18} />, externo: true, color: "text-[#E1306C]" });
  }
  if (pagina.tiktok) {
    acciones.push({ nombre: "TikTok", href: pagina.tiktok, icono: <IconoTiktok tam={18} />, externo: true, color: "text-tinta" });
  }
  if (pagina.facebook) {
    acciones.push({ nombre: "Facebook", href: pagina.facebook, icono: <IconoFacebook tam={18} />, externo: true, color: "text-[#1877F2]" });
  }

  return (
    <div data-tema={tema} style={estilo} className="min-h-screen bg-papel-suave text-tinta">
      <main className="relative mx-auto min-h-screen w-full max-w-xl bg-papel pb-44 sm:shadow-alta">
        {/* ---------- cabecera: la foto de perfil, redonda y centrada; debajo, el nombre y los enlaces en una sola línea ---------- */}
        <header className="relative bg-gradient-to-b from-brand-light to-papel px-5 pb-6 pt-12 text-center">
          <div className="absolute right-3 top-3">
            <CompartirBoton nombre={pagina.nombre} />
          </div>
          <div className="mx-auto flex h-32 w-32 items-center justify-center overflow-hidden rounded-full border-4 border-papel bg-brand-light text-[2.6rem] font-semibold text-brand-texto shadow-media">
            {pagina.fotoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={pagina.fotoUrl} alt={pagina.nombre} className="h-full w-full object-cover" />
            ) : (
              iniciales(pagina.nombre)
            )}
          </div>
          <h1 className="mt-3.5 text-[1.65rem] font-semibold leading-tight tracking-titular text-tinta">{pagina.nombre}</h1>
          {pagina.industria && <p className="mt-0.5 text-[0.98rem] text-tinta-media">{pagina.industria}</p>}

          {/* Los enlaces sociales (y llamar, correo, WhatsApp), cada uno con el color de su plataforma, en una sola línea. */}
          {acciones.length > 0 && (
            <ul className="mt-4 flex flex-nowrap items-center justify-center gap-2.5 overflow-x-auto px-1 py-1">
              {acciones.map((a) => (
                <li key={a.nombre} className="flex-none">
                  <a
                    href={a.href}
                    {...(a.externo ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                    aria-label={a.nombre}
                    title={a.nombre}
                    className="flex h-11 w-11 items-center justify-center rounded-full bg-superficie shadow-sm ring-1 ring-linea transition-all hover:ring-brand active:scale-90"
                  >
                    <span className={a.color}>{a.icono}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-3.5 flex flex-wrap items-center justify-center gap-2">
            {horarios && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-light px-3 py-1.5 text-[0.82rem] font-semibold text-brand-texto">
                <IconoReloj tam={15} />
                {hoy?.trabaja ? `Hoy ${textoDelDia(hoy)}` : "Cerrado hoy"}
              </span>
            )}
            {pagina.telefono && (
              <span className="cifra text-[0.85rem] text-tinta-suave">{formatearTelefonoPersonal(pagina.telefono)}</span>
            )}
          </div>
        </header>

        <div className="px-5">

          {/* ---------- acerca de ---------- */}
          {pagina.descripcion && (
            <section className="mt-7" aria-label="Acerca de">
              <h2 className="mb-2 text-[1.1rem] font-semibold tracking-titular text-tinta">Acerca de</h2>
              <p className="whitespace-pre-line text-[0.95rem] leading-relaxed text-tinta-media">{pagina.descripcion}</p>
            </section>
          )}

          {/* ---------- horario ---------- */}
          {horarios && (
            <details className="group mt-6 rounded-2xl bg-superficie shadow-sm ring-1 ring-linea">
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

          {/* ---------- galería ---------- */}
          {galeria.length > 0 && (
            <section className="mt-8" aria-label="Galería">
              <h2 className="mb-3 text-[1.1rem] font-semibold tracking-titular text-tinta">Galería</h2>
              <CarruselGaleria items={galeria} />
            </section>
          )}

          {/* ---------- la ubicación: el mapa al final, con botones para abrirla y compartirla ---------- */}
          {pagina.googleMapsUrl && (
            <section className="mt-8" aria-label="Ubicación">
              <h2 className="mb-3 text-[1.1rem] font-semibold tracking-titular text-tinta">Dónde estamos</h2>
              <MapaUbicacion
                nombre={pagina.nombre}
                enlace={pagina.googleMapsUrl}
                lat={pagina.ubicacionLat}
                lng={pagina.ubicacionLng}
              />
            </section>
          )}
        </div>

        {/* ---------- crear cita: fija abajo, flotando sobre un difuminado ---------- */}
        <div className="pointer-events-none fixed bottom-0 left-1/2 z-20 w-full max-w-xl -translate-x-1/2">
          <div aria-hidden="true" className="h-10 bg-gradient-to-t from-papel to-transparent" />
          <div className="pointer-events-auto bg-papel px-4 pb-3">
            <Link
              href={`/turnos/${pagina.slug}/reservar`}
              className="flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl bg-brand text-[1rem] font-semibold text-white shadow-alta transition-all hover:bg-brand-dark active:scale-[0.98]"
            >
              <IconoCalendario tam={20} />
              Crear cita
            </Link>
            {/* Tipografía distinta del resto (la monoespaciada del sistema), en mayúsculas y en el grosor más
                fuerte que se carga. El -mr compensa el espacio que "tracking" agrega después de la última
                letra, para que el texto quede centrado de verdad. */}
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
