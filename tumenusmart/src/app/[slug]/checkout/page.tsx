import { prisma } from "@/lib/prisma";
import { Volver } from "@/components/Volver";
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
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Volver href={`/${slug}/carrito`} texto="Volver a mi pedido" />
      <h1 className="mb-6 mt-5 text-[1.35rem] font-semibold tracking-titular">
        Finalizar pedido
      </h1>
      <AvisoTienda estado={estadoTienda} />
      <CheckoutForm
        slug={slug}
        storeLat={store.lat}
        storeLng={store.lng}
        envioModo={store.envioModo === "coordinar" ? "coordinar" : "zonas"}
        aceptaPedidos={estadoTienda.aceptaPedidos}
        motivoBloqueo={motivoSinPedidos(estadoTienda)}
        zonas={zonas.map((z) => ({
          id: z.id,
          nombre: z.nombre,
          radioKm: Number(z.radioKm),
          costoEnvio: Number(z.costoEnvio),
        }))}
      />
    </main>
  );
}
