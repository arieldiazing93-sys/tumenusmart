import { prisma } from "@/lib/prisma";
import { CheckoutForm } from "./CheckoutForm";

export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  const zonas = await prisma.deliveryZone.findMany({
    where: { activo: true },
    orderBy: { nombre: "asc" },
  });

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-xl font-bold text-neutral-900">Finalizar pedido</h1>
      <CheckoutForm
        zonas={zonas.map((z) => ({ ...z, costoEnvio: Number(z.costoEnvio) }))}
      />
    </main>
  );
}
