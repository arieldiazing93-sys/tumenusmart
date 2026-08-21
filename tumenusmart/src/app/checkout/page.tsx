import { prisma } from "@/lib/prisma";
import { CheckoutForm } from "./CheckoutForm";

export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  const [store, zonas] = await Promise.all([
    prisma.store.findFirst(),
    prisma.deliveryZone.findMany({
      where: { activo: true },
      orderBy: { radioKm: "asc" },
    }),
  ]);

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-xl font-bold text-neutral-900">Finalizar pedido</h1>
      <CheckoutForm
        storeLat={store?.lat ?? null}
        storeLng={store?.lng ?? null}
        envioModo={store?.envioModo === "coordinar" ? "coordinar" : "zonas"}
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
