import Link from "next/link";

export const metadata = {
  title: "TuMenuSmart — Menú digital y pedidos por WhatsApp",
  description:
    "Tu carta en el celular de tus clientes. Reciben el pedido por WhatsApp, sin comisiones por venta.",
};

const VENTAJAS = [
  {
    titulo: "Tu carta siempre al día",
    texto:
      "Cambiás un precio y se actualiza al instante. Se acabó reimprimir el menú cada vez que sube algo.",
  },
  {
    titulo: "El pedido llega por WhatsApp",
    texto:
      "Sin aplicaciones que descargar ni comisiones por venta. El cliente arma su pedido y te llega listo.",
  },
  {
    titulo: "Reservas y despacho en un lugar",
    texto:
      "Mesas reservadas, pedidos en preparación y repartidores en camino, todo en el mismo panel.",
  },
];

export default function PortadaPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-16">
      <div className="mb-14">
        <p className="mb-3 text-xs font-bold uppercase tracking-[0.15em] text-brand">
          TuMenuSmart
        </p>
        <h1 className="mb-4 text-4xl font-bold leading-tight text-neutral-900 sm:text-5xl">
          Tu carta, en el celular de tus clientes
        </h1>
        <p className="max-w-xl text-lg text-neutral-600">
          Menú digital con pedidos por WhatsApp y reservas de mesa, pensado para restaurantes
          que quieren vender sin pagar comisiones.
        </p>
      </div>

      <div className="mb-14 flex flex-col gap-6">
        {VENTAJAS.map((v) => (
          <div key={v.titulo} className="border-l-2 border-brand pl-4">
            <h2 className="font-semibold text-neutral-900">{v.titulo}</h2>
            <p className="text-neutral-600">{v.texto}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-neutral-200 bg-white p-6">
        <h2 className="mb-1 font-semibold text-neutral-900">¿Buscabas el menú de un local?</h2>
        <p className="text-sm text-neutral-600">
          Cada negocio tiene su propia dirección — pedile el enlace o escaneá el código QR que
          está en su mesa o mostrador.
        </p>
      </div>

      <div className="mt-10 border-t border-neutral-200 pt-6">
        <Link href="/admin" className="text-sm text-neutral-500 hover:text-brand">
          Entrar al panel de administración →
        </Link>
      </div>
    </main>
  );
}
