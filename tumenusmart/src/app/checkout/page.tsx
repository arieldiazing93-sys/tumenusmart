import { prisma } from "@/lib/prisma";
import { CheckoutForm } from "./CheckoutForm";
import { AvisoTienda } from "@/components/AvisoTienda";
import { obtenerEstadoTienda, motivoSinPedidos } from "@/lib/estado-tienda";

export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  const [store, zonas, estadoTienda] = await Promise.all([
    prisma.store.findFirst(),
    prisma.deliveryZone.findMany({
      where: { activo: true },
      orderBy: { radioKm: "asc" },
    }),
    obtenerEstadoTienda(),
  ]);

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-xl font-bold text-neutral-900">Finalizar pedido</h1>
      <AvisoTienda estado={estadoTienda} />
      <CheckoutForm
        storeLat={store?.lat ?? null}
        storeLng={store?.lng ?? null}
        envioModo={store?.envioModo === "coordinar" ? "coordinar" : "zonas"}
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
