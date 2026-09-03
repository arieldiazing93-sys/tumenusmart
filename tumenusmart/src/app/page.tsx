import { Logo } from "@/components/Logo";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { construirLinkWhatsapp } from "@/lib/whatsapp";

export const metadata = {
  title: "TuMenuSmart — Pedidos por WhatsApp para restaurantes",
  description:
    "Carta digital propia para cada restaurante, con reservas de mesa y pedidos que llegan por WhatsApp. Sin comisiones por venta y sin aplicaciones que instalar.",
};

/**
 * La portada se rearma cada media hora, no en cada visita.
 *
 * Casi todo es fijo; lo único que cambia es a qué carta apunta el botón. Media
 * hora de diferencia no le importa a nadie, y a cambio la página se sirve ya
 * armada: aparece de golpe y no consulta la base.
 */
export const revalidate = 1800;

/** Número al que escribe quien quiere contratar. Cambialo por el tuyo. */
const WHATSAPP_VENTAS = "595984792335";

const MENSAJE_VENTAS = "TuMenuSmart Paraguay";

const INCLUYE = [
  {
    titulo: "Carta digital propia",
    texto:
      "Con su dirección, su logo y sus fotos. Cambiás un precio y se actualiza al instante — se terminó reimprimir el menú.",
  },
  {
    titulo: "Pedidos por WhatsApp",
    texto:
      "El cliente arma el pedido y llega redactado al teléfono del local, con zona de envío, costo y medio de pago.",
  },
  {
    titulo: "Reservas de mesa",
    texto:
      "Con turnos, horarios y cupo por franja. El encargado confirma y deja su nota desde el mismo panel.",
  },
  {
    titulo: "Comanda y ticket",
    texto:
      "Imprimibles desde el navegador, pensados para locales que no tienen sistema de caja.",
  },
  {
    titulo: "Repartidores",
    texto:
      "Cada uno con su enlace propio, donde ve únicamente los pedidos que tiene asignados y marca la entrega.",
  },
  {
    titulo: "Analista comercial",
    texto:
      "Cada lunes le deja al dueño una sola idea concreta para vender más, sacada de sus propios pedidos.",
  },
];

const PASOS = [
  {
    titulo: "Lo damos de alta",
    texto:
      "Nombre, WhatsApp y rubro. El sistema le arma la carta de arranque con productos de ejemplo y le entrega su usuario.",
  },
  {
    titulo: "Ajusta su carta",
    texto:
      "Cambia precios, saca lo que no vende y sube sus fotos. Las fotos se comprimen solas para que la carta cargue al instante.",
  },
  {
    titulo: "Comparte su QR",
    texto:
      "El sistema le genera el afiche imprimible con el código. Lo pega en la mesa y empieza a recibir pedidos.",
  },
];

export default async function PortadaPage() {
  // El botón lleva a una carta que está atendiendo de verdad. Es lo que ningún
  // competidor puede fingir con una captura de pantalla.
  const vitrina = await prisma.store
    .findFirst({
      where: { estado: { not: "suspendido" } },
      orderBy: { createdAt: "asc" },
      select: { slug: true, nombre: true },
    })
    .catch(() => null);

  const cartaReal = vitrina ? `/${vitrina.slug}` : "#incluye";
  const linkVentas = construirLinkWhatsapp(WHATSAPP_VENTAS, MENSAJE_VENTAS);

  return (
    <div className="bg-papel text-tinta">
      {/* ---------------- barra ---------------- */}
      <header className="sticky top-0 z-20 border-b border-linea bg-papel/85 backdrop-blur">
        <div className="mx-auto flex h-[62px] max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
          <span className="flex items-center gap-2 text-[1.06rem] font-semibold tracking-titular">
            <Logo tam={26} color="#D2501F" />
            TuMenuSmart
          </span>
          <nav className="flex items-center gap-6 text-[0.925rem] text-tinta-media">
            <a href="#cuenta" className="hidden hover:text-tinta sm:inline">
              La cuenta
            </a>
            <a href="#incluye" className="hidden hover:text-tinta sm:inline">
              Qué incluye
            </a>
            <a href="#panel" className="hidden hover:text-tinta md:inline">
              El panel
            </a>

            {/* Para el dueño que ya es cliente y perdió el enlace que le
                pasamos por WhatsApp. Va como texto y no como botón: el botón
                naranja es para el que todavía no compró. */}
            <Link
              href="/admin/login"
              className="font-medium text-tinta hover:text-brand"
            >
              Iniciar sesión
            </Link>

            {/* En celular este botón se esconde: el mismo está en la portada,
                dos dedos más abajo, y así la barra no se amontona. */}
            <Link href={cartaReal} className={`${BOTON} hidden sm:inline-flex`}>
              Ver una carta real
            </Link>
          </nav>
        </div>
      </header>

      {/* ---------------- portada ---------------- */}
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-16 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:py-24">
        <div>
          <p className="rotulo animate-subir">Pedidos · Reservas · Datos</p>
          <h1 className="mt-4 animate-subir text-[clamp(2.35rem,5vw,4.05rem)] font-semibold leading-[1.02] [animation-delay:60ms]">
            El pedido llega al WhatsApp que tu local ya usa.
          </h1>
          <p className="mt-5 max-w-[40ch] animate-subir text-[clamp(1.05rem,2.1vw,1.24rem)] leading-relaxed text-tinta-media [animation-delay:140ms]">
            Carta digital propia para cada restaurante, con reservas de mesa y un panel
            que le dice al dueño qué hacer para vender más. Sin comisiones por venta y sin
            aplicaciones que instalar.
          </p>
          <div className="mt-8 flex animate-subir flex-wrap gap-3 [animation-delay:220ms]">
            <Link href={cartaReal} className={BOTON}>
              Ver una carta real
            </Link>
            <a href="#cuenta" className={BOTON_FANTASMA}>
              Cuánto te ahorra
            </a>
          </div>
          <p className="mt-6 animate-subir text-[0.86rem] text-tinta-suave [animation-delay:320ms]">
            Operando en Asunción. Cada local con su propia dirección:{" "}
            <span className="cifra text-tinta-media">tumenusmart.com/tunegocio</span>
          </p>
        </div>

        <Escena nombreLocal={vitrina?.nombre ?? "Pizzería Don Mario"} />
      </section>

      {/* ---------------- cifras ---------------- */}
      <div className="border-y border-linea bg-papel-suave">
        <div className="mx-auto grid max-w-6xl px-5 sm:px-8 md:grid-cols-3">
          <Cifra valor="0%" texto="de comisión por venta. Lo que factura el local queda en el local." />
          <Cifra
            valor="2 min"
            texto="para que un restaurante nuevo tenga su carta online y compartible."
            borde
          />
          <Cifra
            valor="0"
            texto="aplicaciones que instalar. Ni el local ni su cliente descargan nada."
            borde
          />
        </div>
      </div>

      {/* ---------------- la cuenta ---------------- */}
      <section id="cuenta" className="mx-auto max-w-6xl px-5 py-16 sm:px-8 lg:py-24">
        <span className="rotulo">La cuenta que nadie hace</span>
        <h2 className="mt-3 max-w-[24ch] text-[clamp(1.7rem,3.6vw,2.6rem)] font-semibold leading-tight">
          Un restaurante que factura Gs. 30 millones al mes le regala seis a la plataforma.
        </h2>
        <p className="mt-4 max-w-[60ch] text-[1.06rem] text-tinta-media">
          Las aplicaciones de delivery cobran entre 15% y 30% de cada pedido. No es una
          cuota: es un porcentaje que crece justo cuando al local le empieza a ir bien.
        </p>

        <div className="mt-10 grid overflow-hidden rounded-lg border border-linea md:grid-cols-2">
          <div className="p-6 sm:p-8">
            <p className="font-mono text-[0.68rem] uppercase tracking-[0.15em] text-tinta-suave">
              Plataforma con comisión · 20%
            </p>
            <p className="cifra mt-4 text-[clamp(2rem,4.6vw,2.9rem)] font-semibold leading-none">
              Gs. 6.000.000
            </p>
            <p className="mt-2 text-[0.9rem] text-tinta-suave">
              por mes — y sube cada mes que vendas más
            </p>
            <p className="mt-5 text-[0.94rem] text-tinta-media">
              Y el cliente es de la plataforma, no tuyo: su teléfono no lo ves nunca, así
              que no podés hacerlo volver.
            </p>
          </div>

          <div className="border-t border-linea bg-brand-light p-6 sm:p-8 md:border-l md:border-t-0">
            <p className="font-mono text-[0.68rem] uppercase tracking-[0.15em] text-brand-texto">
              TuMenuSmart
            </p>
            <p className="mt-4 text-[clamp(2rem,4.6vw,2.9rem)] font-semibold leading-none tracking-titular text-brand">
              Cuota fija
            </p>
            <p className="mt-2 text-[0.9rem] text-brand-texto">
              El mismo importe vendas lo que vendas
            </p>
            <p className="mt-5 text-[0.94rem] text-tinta-media">
              El pedido entra por tu WhatsApp. El teléfono del cliente queda en tu base de
              datos, y el sistema te avisa cuando alguno deja de pedir.
            </p>
            <a
              href={linkVentas}
              target="_blank"
              rel="noopener noreferrer"
              className={`${BOTON} mt-6`}
            >
              Pedir el precio
            </a>
          </div>
        </div>

        <p className="mt-5 text-[0.86rem] text-tinta-suave">
          Ejemplo con una comisión del 20% sobre Gs. 30.000.000 mensuales, que es el rango
          que cobran las plataformas de delivery. Nuestra cuota no varía con la facturación
          del local.
        </p>
      </section>

      {/* ---------------- qué incluye ---------------- */}
      <section id="incluye" className="mx-auto max-w-6xl px-5 pb-16 sm:px-8 lg:pb-24">
        <span className="rotulo">Qué incluye</span>
        <h2 className="mt-3 max-w-[22ch] text-[clamp(1.7rem,3.6vw,2.6rem)] font-semibold leading-tight">
          Todo lo que un restaurante necesita para vender sin intermediarios.
        </h2>

        <div className="mt-10 grid border-t border-linea sm:grid-cols-2 lg:grid-cols-3">
          {INCLUYE.map((item, i) => (
            <div key={item.titulo} className="border-b border-linea py-6 pr-6">
              <span className="font-mono text-[0.68rem] tracking-wider text-brand">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-2 text-[1.06rem] font-semibold">{item.titulo}</h3>
              <p className="mt-1.5 text-[0.95rem] text-tinta-media">{item.texto}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------- el panel ---------------- */}
      <section id="panel" className="bg-noche py-16 text-noche-tinta lg:py-24">
        <div className="mx-auto max-w-6xl px-5 sm:px-8">
          <span className="rotulo">El panel del dueño</span>
          <h2 className="mt-3 max-w-[24ch] text-[clamp(1.7rem,3.6vw,2.6rem)] font-semibold leading-tight">
            No es un tablero de números. Le dice qué hacer.
          </h2>
          <p className="mt-4 max-w-[60ch] text-[1.06rem] text-noche-suave">
            Un restaurante no necesita más gráficos. Necesita saber qué producto no se
            vende, quién dejó de pedir, y en qué franja tiene la cocina vacía. Una idea por
            semana, con el número que la respalda.
          </p>

          <PanelMuestra />
        </div>
      </section>

      {/* ---------------- cómo empieza ---------------- */}
      <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 lg:py-24">
        <span className="rotulo">Cómo empieza un local</span>
        <h2 className="mt-3 max-w-[24ch] text-[clamp(1.7rem,3.6vw,2.6rem)] font-semibold leading-tight">
          De la primera charla a la carta compartida, el mismo día.
        </h2>

        <div className="mt-10 grid gap-x-8 sm:grid-cols-3">
          {PASOS.map((paso, i) => (
            <div key={paso.titulo} className="border-t-2 border-brand py-6 pr-6">
              <span className="font-mono text-[0.72rem] tracking-wider text-brand">
                PASO {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-2 text-[1.06rem] font-semibold">{paso.titulo}</h3>
              <p className="mt-1.5 text-[0.95rem] text-tinta-media">{paso.texto}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------- cierre ---------------- */}
      <section className="border-t border-linea">
        <div className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-8 px-5 py-16 sm:px-8 lg:py-20">
          <div>
            <span className="rotulo">Para empezar</span>
            <h2 className="mt-3 max-w-[20ch] text-[clamp(1.7rem,3.6vw,2.4rem)] font-semibold leading-tight">
              Mirá una carta funcionando de verdad.
            </h2>
            <p className="mt-4 max-w-[44ch] text-tinta-media">
              No es una demostración armada: es un restaurante que está atendiendo ahora
              mismo con este sistema.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href={cartaReal} className={BOTON}>
              Abrir una carta real
            </Link>
            <a
              href={linkVentas}
              target="_blank"
              rel="noopener noreferrer"
              className={BOTON_FANTASMA}
            >
              Escribinos por WhatsApp
            </a>
          </div>
        </div>
      </section>

      <footer className="border-t border-linea py-8 pb-12 text-[0.86rem] text-tinta-suave">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 sm:px-8">
          <span>TuMenuSmart · Asunción, Paraguay</span>
          <span className="flex items-center gap-5">
            <Link href="/admin/login" className="font-medium text-tinta-media hover:text-brand">
              Iniciar sesión
            </Link>
            <span className="cifra">tumenusmart.com</span>
          </span>
        </div>
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------------
//  Piezas
// ---------------------------------------------------------------------------

const BOTON =
  "inline-flex items-center gap-1.5 rounded bg-brand px-4 py-2.5 text-[0.94rem] font-semibold text-white transition-colors hover:bg-brand-dark";

const BOTON_FANTASMA =
  "inline-flex items-center gap-1.5 rounded border border-linea px-4 py-2.5 text-[0.94rem] font-semibold text-tinta transition-colors hover:border-tinta-suave hover:bg-papel-suave";

function Cifra({ valor, texto, borde }: { valor: string; texto: string; borde?: boolean }) {
  return (
    <div
      className={`py-8 ${borde ? "border-t border-linea md:border-l md:border-t-0 md:pl-8" : "md:pr-8"}`}
    >
      <p className="cifra text-[clamp(1.9rem,4vw,2.6rem)] font-semibold leading-none text-brand">
        {valor}
      </p>
      <p className="mt-2 max-w-[30ch] text-[0.92rem] text-tinta-media">{texto}</p>
    </div>
  );
}

/**
 * La carta y el mensaje que le llega al local, dibujados con CSS.
 *
 * Ni una sola imagen: pesa cero de transferencia y carga instantáneo. Con el
 * cupo mensual que tenemos, una portada llena de fotos se comería el mes.
 */
function Escena({ nombreLocal }: { nombreLocal: string }) {
  const iniciales = nombreLocal
    .split(" ")
    .filter((p) => p.length > 2)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div className="flex max-w-[330px] animate-subir flex-col lg:ml-auto [animation-delay:140ms]">
      {/* la carta, en el celular del cliente */}
      <div className="w-[min(268px,78vw)] self-start overflow-hidden rounded-[22px] border border-linea bg-white shadow-alta">
        <div className="flex h-[26px] items-center justify-center border-b border-linea-fina bg-papel-suave">
          <span className="font-mono text-[0.58rem] tracking-wide text-tinta-suave">
            tumenusmart.com
          </span>
        </div>

        <div className="px-3.5 pb-4 pt-3.5">
          <div className="flex items-center gap-2 border-b border-linea-fina pb-2.5">
            <span className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full bg-brand-light text-[0.78rem] font-bold text-brand">
              {iniciales || "DM"}
            </span>
            <span>
              <span className="block text-[0.83rem] font-semibold tracking-titular">
                {nombreLocal}
              </span>
              <span className="block text-[0.62rem] font-medium text-exito">
                ● Abierto ahora
              </span>
            </span>
          </div>

          <Plato nombre="Pizza Muzzarella" desc="Salsa, muzzarella y orégano" precio="55.000" tono="a" />
          <Plato nombre="Pizza Napolitana" desc="Tomate y ajo" precio="65.000" tono="b" />
          <Plato nombre="Empanada de carne" desc="Unidad" precio="10.000" tono="c" ultimo />

          <div className="mt-3 flex items-center justify-between rounded bg-brand px-2.5 py-2 text-[0.7rem] font-semibold text-white">
            <span>Ver mi pedido · 3 ítems</span>
            <span className="cifra text-[0.72rem]">Gs. 130.000</span>
          </div>
        </div>
      </div>

      {/* el hilo entre las dos cosas */}
      <div className="mr-[118px] h-[26px] w-px self-end bg-gradient-to-b from-transparent to-linea" />
      <p className="mb-0.5 mt-1.5 self-end font-mono text-[0.6rem] uppercase tracking-[0.12em] text-tinta-suave">
        Y al local le llega esto
      </p>

      {/* lo que le llega al restaurante */}
      <div className="w-[min(244px,74vw)] self-end overflow-hidden rounded-xl border border-linea bg-white shadow-media">
        <div className="flex items-center gap-1.5 bg-exito px-2.5 py-1.5 text-[0.64rem] font-semibold text-white">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
            <path d="M12 2a10 10 0 00-8.6 15l-1.3 4.7 4.8-1.3A10 10 0 1012 2z" />
          </svg>
          WhatsApp · {nombreLocal}
        </div>
        <div className="bg-[#F2F0EA] p-2.5">
          <div className="rounded-md bg-white p-2.5 text-[0.63rem] leading-relaxed text-tinta-media shadow-sm">
            <strong className="font-semibold text-tinta">Pedido #0042</strong>
            <br />
            Carlos B. · 0981 234 567
            <br />
            2× Pizza Muzzarella
            <br />
            1× Empanada de carne
            <br />
            Envío: Zona 2
            <span className="mt-1.5 flex justify-between border-t border-linea-fina pt-1.5 font-semibold text-tinta">
              <span>Total</span>
              <span className="cifra">Gs. 130.000</span>
            </span>
            <span className="mt-1 block text-right text-[0.54rem] text-tinta-suave">
              21:04 ✓✓
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

const TONOS: Record<string, string> = {
  a: "linear-gradient(135deg,#F0D9C8,#E3B79A)",
  b: "linear-gradient(135deg,#E9DCC4,#D6C08F)",
  c: "linear-gradient(135deg,#DCE4DA,#B9C9B4)",
};

function Plato({
  nombre,
  desc,
  precio,
  tono,
  ultimo,
}: {
  nombre: string;
  desc: string;
  precio: string;
  tono: string;
  ultimo?: boolean;
}) {
  return (
    <div
      className={`flex items-start gap-2 py-2.5 ${ultimo ? "" : "border-b border-linea-fina"}`}
    >
      <span
        className="h-[34px] w-[34px] flex-none rounded"
        style={{ background: TONOS[tono] }}
        aria-hidden="true"
      />
      <span className="min-w-0">
        <span className="block text-[0.74rem] font-medium leading-tight">{nombre}</span>
        <span className="block text-[0.62rem] leading-snug text-tinta-suave">{desc}</span>
      </span>
      <span className="cifra ml-auto whitespace-nowrap text-[0.68rem] font-medium">
        {precio}
      </span>
    </div>
  );
}

const PEDIDOS_MUESTRA = [
  { n: "#0042", cliente: "Carlos B.", detalle: "2× Muzzarella, 1× Empanada", total: "Gs. 130.000", estado: "En preparación", tono: "ambar" },
  { n: "#0041", cliente: "Lucía M.", detalle: "1× Napolitana Familiar", total: "Gs. 95.000", estado: "Entregado", tono: "verde" },
  { n: "#0040", cliente: "Rodrigo A.", detalle: "3× Empanada, 1× Gaseosa", total: "Gs. 45.000", estado: "Entregado", tono: "verde" },
];

function PanelMuestra() {
  return (
    <div className="mt-10 overflow-hidden rounded-lg border border-noche-linea bg-noche-panel">
      <div className="flex items-center gap-5 overflow-x-auto whitespace-nowrap border-b border-noche-linea px-4 py-2.5 text-[0.8rem] text-noche-suave">
        <span className="flex items-center gap-1.5 font-semibold tracking-titular text-noche-tinta">
            <Logo tam={16} color="#FFFFFF" hueco="#1D1F24" />
            TuMenuSmart
          </span>
        <span className="font-semibold text-noche-tinta">Pedidos</span>
        <span>Productos</span>
        <span>Reservas</span>
        <span>Estadísticas</span>
        <span>Ideas</span>
      </div>

      <div className="p-4 sm:p-6">
        <div className="rounded-lg border border-brand-dark bg-brand/10 p-4">
          <span className="inline-block rounded bg-brand px-1.5 py-0.5 text-[0.63rem] font-semibold text-white">
            Tu idea de esta semana
          </span>
          <h3 className="mt-2 text-[0.96rem] font-semibold">
            23 clientes habituales dejaron de pedir
          </h3>
          <p className="mt-1 text-[0.86rem] text-noche-suave">
            Ya te compraron al menos dos veces y no vuelven hace 45 días. Entre todos
            gastaron Gs. 8.400.000. Son los más baratos de recuperar: ya te conocen y tenés
            su WhatsApp.
          </p>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-[0.84rem]">
            <thead>
              <tr>
                {["N°", "Cliente", "Productos", "Total", "Estado"].map((c, i) => (
                  <th
                    key={c}
                    className={`border-b border-noche-linea px-2.5 py-2 font-mono text-[0.63rem] font-medium uppercase tracking-[0.14em] text-noche-suave ${i === 3 ? "text-right" : "text-left"}`}
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PEDIDOS_MUESTRA.map((p) => (
                <tr key={p.n}>
                  <td className="cifra border-b border-white/5 px-2.5 py-2.5">{p.n}</td>
                  <td className="border-b border-white/5 px-2.5 py-2.5">{p.cliente}</td>
                  <td className="border-b border-white/5 px-2.5 py-2.5">{p.detalle}</td>
                  <td className="cifra whitespace-nowrap border-b border-white/5 px-2.5 py-2.5 text-right">
                    {p.total}
                  </td>
                  <td className="border-b border-white/5 px-2.5 py-2.5">
                    <span
                      className={`inline-block rounded px-1.5 py-0.5 text-[0.68rem] font-semibold ${
                        p.tono === "verde"
                          ? "bg-emerald-500/20 text-emerald-300"
                          : "bg-amber-500/20 text-amber-300"
                      }`}
                    >
                      {p.estado}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
