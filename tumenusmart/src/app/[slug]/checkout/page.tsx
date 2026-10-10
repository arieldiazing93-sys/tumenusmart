import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { CheckoutForm } from "./CheckoutForm";
import { AvisoTienda } from "@/components/AvisoTienda";
import { obtenerEstadoTienda, motivoSinPedidos } from "@/lib/estado-tienda";
import { localPorSlug } from "@/lib/local-por-slug";

export const dynamic = "force-dynamic";

export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const store = await localPorSlug(slug);

  const [zonas, estadoTienda] = await Promise.all([
    prisma.deliveryZone.findMany({
      where: { storeId: store.id, activo: true },
      orderBy: { radioKm: "asc" },
    }),
    obtenerEstadoTienda(store.id),
  ]);

  return (
    <main className="mx-auto max-w-2xl px-4 pb-48 pt-4">
      {/* Arriba: el botón redondo azul para volver al pedido y el título con el nombre del local. */}
      <header className="flex items-center gap-3">
        <Link
          href={`/${slug}/carrito`}
          aria-label="Volver a mi pedido"
          className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-azul-luz text-[1.25rem] leading-none text-azul-oscuro transition-all hover:bg-azul hover:text-white active:scale-90"
        >
          ←
        </Link>
        <div className="min-w-0">
          <p className="truncate text-[0.7rem] font-semibold uppercase tracking-rotulo text-tinta-suave">{store.nombre}</p>
          <h1 className="text-[1.6rem] font-semibold leading-tight tracking-titular text-tinta">Finalizar pedido</h1>
        </div>
      </header>

      <div className="mt-5">
        <AvisoTienda estado={estadoTienda} />
      </div>

      <div className="mt-5">
        <CheckoutForm
          slug={slug}
          nombreLocal={store.nombre}
          whatsappNumero={store.whatsappNumero}
          saludo={store.mensajeSaludo}
          storeLat={store.lat}
          storeLng={store.lng}
          envioModo={store.envioModo === "coordinar" ? "coordinar" : "zonas"}
          aceptaPedidos={estadoTienda.aceptaPedidos}
          motivoBloqueo={motivoSinPedidos(estadoTienda)}
          aceptaEfectivo={store.aceptaEfectivo}
          aceptaTransferencia={store.aceptaTransferencia}
          aceptaTarjetaDebito={store.aceptaTarjetaDebito}
          aceptaTarjetaCredito={store.aceptaTarjetaCredito}
          aceptaDelivery={store.aceptaDelivery}
          aceptaRetiro={store.aceptaRetiro}
          pedidosEnSistema={store.pedidosWebActivo}
          zonas={zonas.map((z) => ({
            id: z.id,
            nombre: z.nombre,
            radioKm: Number(z.radioKm),
            costoEnvio: Number(z.costoEnvio),
          }))}
        />
      </div>
    </main>
  );
}
