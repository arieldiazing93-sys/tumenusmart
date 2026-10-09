import type { ComponentType } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { prisma } from "@/lib/prisma";
import { construirLinkWhatsapp } from "@/lib/whatsapp";
import {
  IconoAsistencia,
  IconoCaja,
  IconoCarta,
  IconoCheck,
  IconoFlecha,
  IconoMas,
  IconoStock,
  IconoTurnos,
  IconoWhatsapp,
} from "./_portada/Iconos";
import {
  ADEMAS,
  FLUJO,
  FUNCIONES_ASISTENCIA,
  FUNCIONES_POS,
  FUNCIONES_RESTAURANTE,
  FUNCIONES_STOCK,
  FUNCIONES_TURNOS,
  MODULOS,
  PARA_QUIEN,
  PASOS,
  PREGUNTAS,
  type Funcion,
} from "./_portada/contenido";
import {
  MaquetaAsistencia,
  MaquetaCarta,
  MaquetaPos,
  MaquetaStock,
  MaquetaTurnos,
  VisualHero,
} from "./_portada/Maquetas";
import MenuMovil from "./_portada/MenuMovil";

const DESCRIPCION =
  "Un solo sistema para tu negocio en Paraguay: punto de venta con factura, control de stock, asistencia del personal con reconocimiento de cara y reserva de turnos. Sin comisiones por venta y sin instalar nada.";

export const metadata: Metadata = {
  title: "TuMenuSmart — Punto de venta, control de stock, asistencia y reserva de turnos",
  description: DESCRIPCION,
  openGraph: {
    title: "TuMenuSmart — Tu negocio entero, en un solo sistema",
    description: DESCRIPCION,
    type: "website",
    locale: "es_PY",
    siteName: "TuMenuSmart",
  },
};

/**
 * La portada se rearma cada media hora, no en cada visita.
 *
 * Casi todo es fijo; lo único que cambia es a qué carta y a qué página de reservas
 * apuntan los botones "ver en vivo". Media hora de diferencia no le importa a
 * nadie, y a cambio la página se sirve ya armada: aparece de golpe y no consulta
 * la base.
 */
export const revalidate = 1800;

/** Número al que escribe quien quiere contratar. Cambialo por el tuyo. */
const WHATSAPP_VENTAS = "595984792335";

const MENSAJE_VENTAS = "Hola, quiero ver una demo de TuMenuSmart";

const ENLACES = [
  { href: "#pos", texto: "Punto de venta" },
  { href: "#stock", texto: "Stock" },
  { href: "#asistencia", texto: "Asistencia" },
  { href: "#turnos", texto: "Turnos" },
  { href: "#restaurantes", texto: "Restaurantes" },
  { href: "#preguntas", texto: "Preguntas" },
];

export default async function PortadaPage() {
  // Los botones "ver en vivo" llevan a un negocio que está atendiendo de verdad:
  // es lo que ningún competidor puede fingir con una captura de pantalla.
  const vitrina = await prisma.store
    .findFirst({
      where: { estado: { not: "suspendido" } },
      orderBy: { createdAt: "asc" },
      select: { slug: true, nombre: true },
    })
    .catch(() => null);

  const paginaDemo = await prisma.paginaReservas
    .findFirst({
      where: { habilitada: true },
      orderBy: { createdAt: "asc" },
      select: { slug: true },
    })
    .catch(() => null);

  const cartaReal = vitrina ? `/${vitrina.slug}` : "#restaurantes";
  const reservaReal = paginaDemo ? `/turnos/${paginaDemo.slug}` : "#turnos";
  const linkVentas = construirLinkWhatsapp(WHATSAPP_VENTAS, MENSAJE_VENTAS);

  // Datos para los buscadores: qué es el producto y las preguntas que ya contestamos en pantalla.
  const datosEstructurados = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        name: "TuMenuSmart",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        inLanguage: "es",
        areaServed: "PY",
        description: DESCRIPCION,
      },
      {
        "@type": "FAQPage",
        mainEntity: PREGUNTAS.map((p) => ({
          "@type": "Question",
          name: p.pregunta,
          acceptedAnswer: { "@type": "Answer", text: p.respuesta },
        })),
      },
    ],
  };

  return (
    <div className="bg-papel text-tinta">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(datosEstructurados).replace(/</g, "\\u003c") }}
      />

      {/* ---------------- barra ---------------- */}
      <header className="sticky top-0 z-30 border-b border-linea bg-papel/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
          <Link href="/" className="flex items-center gap-2 text-[1.08rem] font-semibold tracking-titular">
            <Logo tam={28} color="#D2501F" />
            TuMenuSmart
          </Link>

          <nav aria-label="Secciones de la página" className="hidden items-center gap-7 text-[0.92rem] text-tinta-media xl:flex">
            {ENLACES.map((e) => (
              <a key={e.href} href={e.href} className="transition-colors hover:text-tinta">
                {e.texto}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2.5 sm:gap-4">
            {/* Para el dueño que ya es cliente y perdió el enlace que le pasamos. Va como texto y no como
                botón: el botón naranja es para el que todavía no contrató. */}
            <Link
              href="/admin/login"
              className="hidden text-[0.92rem] font-medium text-tinta transition-colors hover:text-brand sm:inline"
            >
              Iniciar sesión
            </Link>
            <a
              href={linkVentas}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Pedir una demo"
              className="inline-flex h-10 items-center whitespace-nowrap rounded-full bg-brand px-4 text-[0.88rem] font-semibold text-white transition-colors hover:bg-brand-dark"
            >
              <span className="sm:hidden">Demo</span>
              <span className="hidden sm:inline">Pedir una demo</span>
            </a>
            <MenuMovil enlaces={ENLACES} />
          </div>
        </div>
      </header>

      <main>
        {/* ---------------- portada ---------------- */}
        <section className="relative isolate overflow-hidden">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[640px]"
            style={{
              backgroundImage:
                "radial-gradient(55% 60% at 78% 0%, rgb(var(--brand-light)) 0%, transparent 72%)",
            }}
          />
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-16 pt-12 sm:px-8 lg:grid-cols-[1.02fr_0.98fr] lg:gap-14 lg:pb-24 lg:pt-20">
            <div>
              <p className="inline-flex animate-subir items-center gap-2 rounded-full bg-brand-light px-3.5 py-1.5 text-[0.8rem] font-semibold text-brand-texto">
                <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-hidden="true" />
                Hecho en Paraguay · Sin comisión por venta
              </p>
              <h1 className="mt-5 animate-subir text-[clamp(2.4rem,5.2vw,4rem)] font-semibold leading-[1.02] [animation-delay:60ms]">
                Tu negocio entero, <span className="text-brand">en un solo sistema.</span>
              </h1>
              <p className="mt-5 max-w-[46ch] animate-subir text-[clamp(1.05rem,2vw,1.22rem)] leading-relaxed text-tinta-media [animation-delay:140ms]">
                Punto de venta con factura, control de stock, asistencia del personal y reserva de turnos.
                Todo conectado, en el navegador y sin instalar nada.
              </p>

              <div className="mt-7 flex animate-subir flex-wrap gap-2.5 [animation-delay:200ms]">
                {MODULOS.map((m) => (
                  <a
                    key={m.id}
                    href={`#${m.id}`}
                    className="inline-flex items-center gap-2 rounded-full border border-linea bg-superficie py-1.5 pl-1.5 pr-3.5 text-[0.84rem] font-medium transition-colors hover:border-tinta-suave"
                  >
                    <span className={`flex h-6 w-6 items-center justify-center rounded-full ${m.tono}`}>
                      <m.icono tam={14} />
                    </span>
                    {m.titulo}
                  </a>
                ))}
              </div>

              <div className="mt-8 flex animate-subir flex-wrap gap-3 [animation-delay:260ms]">
                <a href={linkVentas} target="_blank" rel="noopener noreferrer" className={`${BOTON} w-full sm:w-auto`}>
                  <IconoWhatsapp tam={18} />
                  Pedir una demo
                </a>
                <Link href={cartaReal} className={`${BOTON_FANTASMA} w-full sm:w-auto`}>
                  Ver una carta real
                </Link>
              </div>

              <ul className="mt-6 flex animate-subir flex-wrap gap-x-5 gap-y-1.5 text-[0.86rem] text-tinta-media [animation-delay:320ms]">
                {["Sin instalar nada", "Funciona en PC, tablet y celular", "Cuota fija mensual"].map((t) => (
                  <li key={t} className="flex items-center gap-1.5">
                    <IconoCheck tam={15} className="text-exito" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>

            <div className="animate-subir [animation-delay:160ms]">
              <VisualHero />
              <p className="mt-3 text-center text-[0.72rem] text-tinta-suave lg:mt-0">
                Pantalla ilustrativa con datos de ejemplo.
              </p>
            </div>
          </div>
        </section>

        {/* ---------------- las cuatro herramientas ---------------- */}
        <section className="border-y border-linea bg-papel-suave py-16 lg:py-20">
          <div className="mx-auto max-w-6xl px-5 sm:px-8">
            <div className="max-w-[56ch]">
              <span className="rotulo">Todo en uno</span>
              <h2 className={H2}>Cuatro herramientas que trabajan juntas.</h2>
              <p className="mt-4 text-[1.04rem] text-tinta-media">
                Comparten los mismos productos, clientes, personal y caja: lo que cargás una vez sirve en todo el
                sistema.
              </p>
            </div>

            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {MODULOS.map((m) => (
                <a
                  key={m.id}
                  href={`#${m.id}`}
                  className="group flex flex-col rounded-2xl border border-linea bg-superficie p-6 transition-shadow hover:shadow-media"
                >
                  <span className={`flex h-12 w-12 items-center justify-center rounded-xl ${m.tono}`}>
                    <m.icono tam={24} />
                  </span>
                  <h3 className="mt-5 text-[1.12rem] font-semibold">{m.titulo}</h3>
                  <p className="mt-1.5 flex-1 text-[0.94rem] leading-relaxed text-tinta-media">{m.texto}</p>
                  <span className="mt-5 inline-flex items-center gap-1.5 text-[0.88rem] font-semibold text-brand">
                    Ver cómo funciona
                    <IconoFlecha tam={16} className="transition-transform group-hover:translate-x-0.5" />
                  </span>
                </a>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------- punto de venta ---------------- */}
        <section id="pos" className="scroll-mt-16 bg-noche py-16 text-noche-tinta lg:py-24">
          <div className="mx-auto max-w-6xl px-5 sm:px-8">
            {/* La caja es el corazón del sistema: su pantalla va a todo el ancho, debajo del texto. */}
            <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
              <div>
                <Etiqueta icono={IconoCaja} texto="Punto de venta" tono="bg-brand/15 text-brand" />
                <h2 className={H2}>Cobrá en segundos. La caja se cuadra sola.</h2>
                <p className="mt-4 max-w-[54ch] text-[1.04rem] leading-relaxed text-noche-suave">
                  Abrís el turno al empezar el día, cobrás cada venta en un par de toques y cerrás con el arqueo
                  hecho: cuánto entró en efectivo, tarjeta y transferencia, sin sumar nada a mano.
                </p>
              </div>
              <ListaFunciones items={FUNCIONES_POS} oscuro className="lg:mt-1" />
            </div>
            <div className="mt-12 lg:mt-14">
              <MaquetaPos />
            </div>
          </div>
        </section>

        {/* ---------------- control de stock ---------------- */}
        <section id="stock" className="scroll-mt-16 py-16 lg:py-24">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 sm:px-8 lg:grid-cols-2 lg:gap-16">
            <div className="lg:order-last">
              <Etiqueta icono={IconoStock} texto="Control de stock" tono="bg-exito-luz text-exito" />
              <h2 className={H2}>Sabé cuánto tenés, cuánto te cuesta y qué se te acaba.</h2>
              <p className="mt-4 max-w-[54ch] text-[1.04rem] leading-relaxed text-tinta-media">
                Cargás tus insumos y la receta de cada producto. Cada venta descuenta lo que se usó, y el costo de
                cada plato se calcula solo: ves el margen real y no el que imaginás.
              </p>
              <ListaFunciones items={FUNCIONES_STOCK} />
            </div>
            <MaquetaStock />
          </div>
        </section>

        {/* ---------------- asistencia ---------------- */}
        <section id="asistencia" className="scroll-mt-16 bg-papel-suave py-16 lg:py-24">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 sm:px-8 lg:grid-cols-2 lg:gap-16">
            <div>
              <Etiqueta icono={IconoAsistencia} texto="Asistencia del personal" tono="bg-azul-luz text-azul" />
              <h2 className={H2}>Marcación con PIN y reconocimiento de cara. Sin tarjetas ni planillas.</h2>
              <p className="mt-4 max-w-[54ch] text-[1.04rem] leading-relaxed text-tinta-media">
                Dejás un celular fijo en la entrada del local. Cada colaborador marca con su PIN, el sistema
                detecta su cara y guarda la foto de la marcación. Vos ves quién llegó y a qué hora, desde tu panel.
              </p>
              <ListaFunciones items={FUNCIONES_ASISTENCIA} />
            </div>
            <MaquetaAsistencia />
          </div>
        </section>

        {/* ---------------- reserva de turnos ---------------- */}
        <section id="turnos" className="scroll-mt-16 py-16 lg:py-24">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 sm:px-8 lg:grid-cols-2 lg:gap-16">
            <div className="lg:order-last">
              <Etiqueta icono={IconoTurnos} texto="Reserva de turnos" tono="bg-violeta-luz text-violeta" />
              <h2 className={H2}>Una agenda que se llena sola, y el cobro entra directo a la caja.</h2>
              <p className="mt-4 max-w-[54ch] text-[1.04rem] leading-relaxed text-tinta-media">
                Para peluquerías, barberías y salones. El cliente reserva desde una página con tu marca: elige el
                servicio, con quién quiere atenderse y una hora libre de verdad. El turno aparece en tu calendario
                y, al atenderlo, cobrás desde la misma cita.
              </p>
              <ListaFunciones items={FUNCIONES_TURNOS} />
              <div className="mt-8">
                <Link href={reservaReal} className={BOTON}>
                  Ver una reserva real
                  <IconoFlecha tam={16} />
                </Link>
              </div>
            </div>
            <MaquetaTurnos />
          </div>
        </section>

        {/* ---------------- restaurantes ---------------- */}
        <section id="restaurantes" className="scroll-mt-16 bg-papel-suave py-16 lg:py-24">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 sm:px-8 lg:grid-cols-2 lg:gap-16">
            <div>
              <Etiqueta icono={IconoCarta} texto="Para restaurantes y comidas rápidas" tono="bg-brand-light text-brand-texto" />
              <h2 className={H2}>Carta digital, pedidos por WhatsApp y servicio de mesa.</h2>
              <p className="mt-4 max-w-[54ch] text-[1.04rem] leading-relaxed text-tinta-media">
                Cada local tiene su carta online con su dirección y su QR. El pedido llega redactado al WhatsApp del
                local, el mozo carga la mesa desde su celular y la comanda sale sola en la cocina.
              </p>
              <ListaFunciones items={FUNCIONES_RESTAURANTE} />
              <div className="mt-8">
                <Link href={cartaReal} className={BOTON}>
                  Ver una carta real
                  <IconoFlecha tam={16} />
                </Link>
              </div>
            </div>
            <MaquetaCarta nombreLocal={vitrina?.nombre ?? "Pizzería Don Mario"} />
          </div>
        </section>

        {/* ---------------- y además ---------------- */}
        <section className="py-16 lg:py-24">
          <div className="mx-auto max-w-6xl px-5 sm:px-8">
            <div className="max-w-[56ch]">
              <span className="rotulo">Y además</span>
              <h2 className={H2}>Lo que acompaña a todo lo anterior.</h2>
            </div>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {ADEMAS.map((a) => (
                <div key={a.titulo} className="rounded-2xl border border-linea bg-superficie p-6">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-papel-hundido text-tinta">
                    <a.icono tam={22} />
                  </span>
                  <h3 className="mt-4 text-[1.05rem] font-semibold">{a.titulo}</h3>
                  <p className="mt-1.5 text-[0.93rem] leading-relaxed text-tinta-media">{a.texto}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------- todo conectado ---------------- */}
        <section className="bg-brand-light py-16 lg:py-24">
          <div className="mx-auto max-w-6xl px-5 sm:px-8">
            <div className="max-w-[58ch]">
              <span className="rotulo">Todo conectado</span>
              <h2 className={H2}>Una venta, y el resto se acomoda solo.</h2>
              <p className="mt-4 text-[1.04rem] text-tinta-media">
                Es la diferencia de tener un solo sistema en lugar de cuatro programas sueltos: no cargás nada dos
                veces y los números siempre coinciden.
              </p>
            </div>

            <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {FLUJO.map((paso, i) => (
                <li key={paso.titulo} className="relative rounded-2xl border border-brand-tinte bg-superficie p-5">
                  <span className="cifra flex h-8 w-8 items-center justify-center rounded-full bg-brand text-[0.82rem] font-semibold text-white">
                    {i + 1}
                  </span>
                  <h3 className="mt-4 text-[1.02rem] font-semibold">{paso.titulo}</h3>
                  <p className="mt-1 text-[0.9rem] leading-relaxed text-tinta-media">{paso.texto}</p>
                  {i < FLUJO.length - 1 ? (
                    <IconoFlecha
                      tam={20}
                      className="absolute -right-[18px] top-1/2 z-10 hidden -translate-y-1/2 text-brand lg:block"
                    />
                  ) : null}
                </li>
              ))}
            </ol>

            <p className="mt-8 max-w-[62ch] text-[0.98rem] text-tinta-media">
              Y lo demás queda en el mismo lugar: la asistencia del personal, la comisión de cada profesional y las
              propinas de cada mozo.
            </p>
          </div>
        </section>

        {/* ---------------- para quién ---------------- */}
        <section className="py-16 lg:py-24">
          <div className="mx-auto max-w-6xl px-5 sm:px-8">
            <div className="max-w-[56ch]">
              <span className="rotulo">Para quién es</span>
              <h2 className={H2}>Pensado para negocios de comida y de servicios.</h2>
            </div>
            <div className="mt-10 grid gap-4 lg:grid-cols-3">
              {PARA_QUIEN.map((p) => (
                <div key={p.titulo} className="flex flex-col rounded-2xl border border-linea bg-superficie p-6">
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-light text-brand">
                    <p.icono tam={24} />
                  </span>
                  <h3 className="mt-5 text-[1.12rem] font-semibold leading-snug">{p.titulo}</h3>
                  <p className="mt-1.5 text-[0.94rem] leading-relaxed text-tinta-media">{p.texto}</p>
                  <ul className="mt-5 flex flex-wrap gap-2">
                    {p.usa.map((u) => (
                      <li key={u} className="rounded-full bg-papel-hundido px-3 py-1 text-[0.78rem] font-medium text-tinta-media">
                        {u}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------- la cuenta ---------------- */}
        <section id="cuenta" className="scroll-mt-16 bg-papel-suave py-16 lg:py-24">
          <div className="mx-auto max-w-6xl px-5 sm:px-8">
            <span className="rotulo">Sin comisiones por venta</span>
            <h2 className={`${H2} max-w-[26ch]`}>
              Un restaurante que factura Gs. 30 millones al mes le regala seis a la plataforma.
            </h2>
            <p className="mt-4 max-w-[60ch] text-[1.04rem] text-tinta-media">
              Las aplicaciones de delivery cobran entre 15 % y 30 % de cada pedido. No es una cuota: es un
              porcentaje que crece justo cuando al local le empieza a ir bien.
            </p>

            <div className="mt-10 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-linea bg-superficie p-6 sm:p-8">
                <p className="font-mono text-[0.68rem] uppercase tracking-[0.15em] text-tinta-suave">
                  Plataforma con comisión · 20 %
                </p>
                <p className="cifra mt-4 text-[clamp(2rem,4.6vw,2.9rem)] font-semibold leading-none">
                  Gs. 6.000.000
                </p>
                <p className="mt-2 text-[0.9rem] text-tinta-suave">por mes — y sube cada mes que vendas más</p>
                <p className="mt-5 text-[0.94rem] text-tinta-media">
                  Y el cliente es de la plataforma, no tuyo: su teléfono no lo ves nunca, así que no podés hacerlo
                  volver.
                </p>
              </div>

              <div className="rounded-2xl border border-brand-tinte bg-brand-light p-6 sm:p-8">
                <p className="font-mono text-[0.68rem] uppercase tracking-[0.15em] text-brand-texto">TuMenuSmart</p>
                <p className="mt-4 text-[clamp(2rem,4.6vw,2.9rem)] font-semibold leading-none tracking-titular text-brand">
                  Cuota fija
                </p>
                <p className="mt-2 text-[0.9rem] text-brand-texto">El mismo importe vendas lo que vendas</p>
                <p className="mt-5 text-[0.94rem] text-tinta-media">
                  El pedido entra por tu WhatsApp. El teléfono del cliente queda en tu base de datos, y el sistema
                  te avisa cuando alguno deja de pedir.
                </p>
                <a href={linkVentas} target="_blank" rel="noopener noreferrer" className={`${BOTON} mt-6`}>
                  Pedir el precio
                </a>
              </div>
            </div>

            <p className="mt-5 text-[0.84rem] text-tinta-suave">
              Ejemplo con una comisión del 20 % sobre Gs. 30.000.000 mensuales, que es el rango que cobran las
              plataformas de delivery. Nuestra cuota no varía con la facturación del local.
            </p>
          </div>
        </section>

        {/* ---------------- cómo empieza ---------------- */}
        <section className="py-16 lg:py-24">
          <div className="mx-auto max-w-6xl px-5 sm:px-8">
            <div className="max-w-[56ch]">
              <span className="rotulo">Cómo empieza un negocio</span>
              <h2 className={H2}>Empezar es más simple de lo que parece.</h2>
            </div>
            <ol className="mt-10 grid gap-4 md:grid-cols-3">
              {PASOS.map((paso, i) => (
                <li key={paso.titulo} className="rounded-2xl border border-linea bg-superficie p-6">
                  <span className="cifra flex h-10 w-10 items-center justify-center rounded-full bg-brand-light text-[0.95rem] font-semibold text-brand">
                    {i + 1}
                  </span>
                  <h3 className="mt-5 text-[1.1rem] font-semibold">{paso.titulo}</h3>
                  <p className="mt-1.5 text-[0.94rem] leading-relaxed text-tinta-media">{paso.texto}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ---------------- preguntas ---------------- */}
        <section id="preguntas" className="scroll-mt-16 border-t border-linea bg-papel-suave py-16 lg:py-24">
          <div className="mx-auto grid max-w-6xl gap-10 px-5 sm:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
            <div className="lg:sticky lg:top-24 lg:self-start">
              <span className="rotulo">Preguntas frecuentes</span>
              <h2 className={H2}>Lo que casi todos preguntan antes de empezar.</h2>
              <p className="mt-4 max-w-[40ch] text-[1.02rem] text-tinta-media">
                ¿Te quedó otra duda? Escribinos y te respondemos por WhatsApp.
              </p>
              <a href={linkVentas} target="_blank" rel="noopener noreferrer" className={`${BOTON} mt-6`}>
                <IconoWhatsapp tam={18} />
                Escribinos
              </a>
            </div>

            <div className="flex flex-col gap-3">
              {PREGUNTAS.map((p) => (
                <details key={p.pregunta} className="group rounded-2xl border border-linea bg-superficie">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-2xl px-5 py-4 text-[1rem] font-semibold [&::-webkit-details-marker]:hidden">
                    {p.pregunta}
                    <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-papel-hundido text-tinta-media transition-transform group-open:rotate-45">
                      <IconoMas tam={16} />
                    </span>
                  </summary>
                  <p className="px-5 pb-5 text-[0.95rem] leading-relaxed text-tinta-media">{p.respuesta}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------- cierre ---------------- */}
        <section className="py-16 lg:py-24">
          <div className="mx-auto max-w-6xl px-5 sm:px-8">
            <div className="relative isolate overflow-hidden rounded-3xl bg-noche px-6 py-14 text-center text-noche-tinta sm:px-12 lg:py-20">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 -z-10"
                style={{
                  backgroundImage:
                    "radial-gradient(60% 80% at 50% 0%, rgb(var(--brand) / 0.35) 0%, transparent 70%)",
                }}
              />
              <h2 className="mx-auto max-w-[22ch] text-[clamp(1.9rem,4vw,3rem)] font-semibold leading-[1.08]">
                Mirá cómo quedaría en tu negocio.
              </h2>
              <p className="mx-auto mt-4 max-w-[50ch] text-[1.04rem] text-noche-suave">
                Escribinos por WhatsApp y te mostramos el sistema funcionando, con las herramientas que tu rubro
                necesita.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <a href={linkVentas} target="_blank" rel="noopener noreferrer" className={`${BOTON} w-full sm:w-auto`}>
                  <IconoWhatsapp tam={18} />
                  Pedir una demo
                </a>
                <Link href={cartaReal} className={`${BOTON_SOBRE_OSCURO} w-full sm:w-auto`}>
                  Ver una carta real
                </Link>
                <Link href={reservaReal} className={`${BOTON_SOBRE_OSCURO} w-full sm:w-auto`}>
                  Ver una reserva real
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ---------------- pie ---------------- */}
      <footer className="border-t border-linea bg-papel-suave">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-12 sm:grid-cols-2 sm:px-8 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <span className="flex items-center gap-2 text-[1.08rem] font-semibold tracking-titular">
              <Logo tam={26} color="#D2501F" />
              TuMenuSmart
            </span>
            <p className="mt-3 max-w-[34ch] text-[0.9rem] text-tinta-media">
              Punto de venta, control de stock, asistencia y reserva de turnos en un solo sistema.
            </p>
          </div>

          <div>
            <p className="text-[0.82rem] font-semibold uppercase tracking-wider text-tinta-suave">Herramientas</p>
            <ul className="mt-3 flex flex-col gap-2 text-[0.92rem] text-tinta-media">
              {ENLACES.slice(0, 5).map((e) => (
                <li key={e.href}>
                  <a href={e.href} className="transition-colors hover:text-brand">
                    {e.texto}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-[0.82rem] font-semibold uppercase tracking-wider text-tinta-suave">Verlo en vivo</p>
            <ul className="mt-3 flex flex-col gap-2 text-[0.92rem] text-tinta-media">
              <li>
                <Link href={cartaReal} className="transition-colors hover:text-brand">
                  Una carta real
                </Link>
              </li>
              <li>
                <Link href={reservaReal} className="transition-colors hover:text-brand">
                  Una reserva real
                </Link>
              </li>
              <li>
                <a href="#preguntas" className="transition-colors hover:text-brand">
                  Preguntas frecuentes
                </a>
              </li>
            </ul>
          </div>

          <div>
            <p className="text-[0.82rem] font-semibold uppercase tracking-wider text-tinta-suave">Tu cuenta</p>
            <ul className="mt-3 flex flex-col gap-2 text-[0.92rem] text-tinta-media">
              <li>
                <Link href="/admin/login" className="font-medium text-tinta transition-colors hover:text-brand">
                  Iniciar sesión
                </Link>
              </li>
              <li>
                <a href={linkVentas} target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-brand">
                  Escribinos por WhatsApp
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-linea">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-5 pb-8 text-[0.84rem] text-tinta-suave sm:px-8">
            <span>TuMenuSmart · Asunción, Paraguay</span>
            <span className="cifra">tumenusmart.com</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------------
//  Piezas
// ---------------------------------------------------------------------------

const BOTON =
  "inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-brand px-6 text-[0.96rem] font-semibold text-white shadow-media transition-colors hover:bg-brand-dark";

const BOTON_FANTASMA =
  "inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-linea bg-superficie px-6 text-[0.96rem] font-semibold text-tinta transition-colors hover:border-tinta-suave hover:bg-papel-suave";

const BOTON_SOBRE_OSCURO =
  "inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-noche-linea bg-noche-panel px-6 text-[0.96rem] font-semibold text-noche-tinta transition-colors hover:border-noche-suave";

const H2 = "mt-3 text-[clamp(1.75rem,3.6vw,2.6rem)] font-semibold leading-[1.1]";

/** La etiqueta con ícono que abre cada sección de herramienta. */
function Etiqueta({
  icono: Ico,
  texto,
  tono,
}: {
  icono: ComponentType<{ className?: string; tam?: number }>;
  texto: string;
  tono: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[0.8rem] font-semibold ${tono}`}>
      <Ico tam={16} />
      {texto}
    </span>
  );
}

/** Lo que hace cada herramienta, en dos columnas con un tilde. */
function ListaFunciones({
  items,
  oscuro = false,
  className = "mt-8",
}: {
  items: Funcion[];
  oscuro?: boolean;
  /** El margen de arriba: cambia según la lista vaya debajo del texto o a su lado. */
  className?: string;
}) {
  return (
    <ul className={`grid gap-x-8 gap-y-5 sm:grid-cols-2 ${className}`}>
      {items.map((f) => (
        <li key={f.titulo} className="flex gap-3">
          <span
            className={`mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full ${
              oscuro ? "bg-emerald-500/15 text-emerald-300" : "bg-exito-luz text-exito"
            }`}
          >
            <IconoCheck tam={14} />
          </span>
          <span>
            <span className={`block text-[0.97rem] font-semibold leading-snug ${oscuro ? "text-noche-tinta" : ""}`}>
              {f.titulo}
            </span>
            <span
              className={`mt-0.5 block text-[0.9rem] leading-relaxed ${
                oscuro ? "text-noche-suave" : "text-tinta-media"
              }`}
            >
              {f.texto}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
