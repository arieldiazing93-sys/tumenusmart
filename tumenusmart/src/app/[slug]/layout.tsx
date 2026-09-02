import type { Metadata } from "next";
import { CartProvider } from "@/components/CartProvider";
import { localPorSlug, estaSuspendido } from "@/lib/local-por-slug";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const local = await localPorSlug(slug);
  return {
    title: local.nombre,
    description: `Menú digital de ${local.nombre} — pedí desde tu celular.`,
  };
}

export default async function LocalLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const local = await localPorSlug(slug);

  // Un local suspendido conserva todo pero deja de atender. El mensaje es
  // deliberadamente neutro: nunca menciona pagos, porque quien lo lee es un
  // cliente del negocio, no el dueño.
  if (estaSuspendido(local)) {
    return (
      <main className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-6 text-center">
        <div className="mb-4 text-4xl">🕒</div>
        <h1 className="mb-2 text-[1.2rem] font-semibold tracking-titular text-tinta">
          Este menú no está disponible
        </h1>
        <p className="text-[0.9rem] text-tinta-media">
          Por el momento no se pueden tomar pedidos desde acá. Si querés hacer un pedido,
          comunicate directamente con el local.
        </p>
      </main>
    );
  }

  // El carrito se guarda por local: si alguien abre dos menús distintos en el
  // mismo navegador, cada uno mantiene el suyo sin mezclarse.
  return <CartProvider claveLocal={local.slug}>{children}</CartProvider>;
}
