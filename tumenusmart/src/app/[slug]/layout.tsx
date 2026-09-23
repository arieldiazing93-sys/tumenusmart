import type { Metadata } from "next";
import { CartProvider } from "@/components/CartProvider";
import { localPorSlug, estaSuspendido } from "@/lib/local-por-slug";
import { derivarPaletaMarca, esHexValido } from "@/lib/color-marca";

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

  // "sistema" (default) sigue el modo del dispositivo de quien mira,
  // "claro"/"oscuro" lo fuerzan — ver el bloque [data-tema] en globals.css.
  // Siempre uno de los tres, nunca undefined: el admin no entra por acá, así
  // que nunca hace falta "no tocar nada".
  const dataTema =
    local.modoPlantilla === "oscuro" || local.modoPlantilla === "claro"
      ? local.modoPlantilla
      : "sistema";

  // Un local suspendido conserva todo pero deja de atender. El mensaje es
  // deliberadamente neutro: nunca menciona pagos, porque quien lo lee es un
  // cliente del negocio, no el dueño.
  if (estaSuspendido(local)) {
    return (
      <div data-tema={dataTema} className="min-h-screen bg-papel-suave text-tinta">
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
      </div>
    );
  }

  // Color de marca propio del local, solo acá — el panel admin nunca entra
  // por este layout, así que sigue siempre naranja. Sin colorPrimario (la
  // mayoría de los locales, hoy), no se pisa nada: quedan los valores por
  // defecto que ya trae :root en globals.css.
  const paleta =
    local.colorPrimario && esHexValido(local.colorPrimario)
      ? derivarPaletaMarca(local.colorPrimario)
      : null;

  // <body> (layout raíz, compartido con el admin) pinta bg-papel-suave y
  // text-tinta y nunca se toca acá — por eso este div pinta los suyos
  // propios, con el token ya reescrito. Las dos cosas hacen falta, no solo
  // el fondo: <body> queda AFUERA del subárbol reescrito, así que cualquier
  // texto de acá adentro sin color propio (heredado, sin clase text-*)
  // hereda el color YA CALCULADO de <body> — fijo en el valor claro, nunca
  // el de esta variable — y quedaría invisible en modo oscuro (texto oscuro
  // sobre fondo oscuro) aunque el fondo de su tarjeta sí cambie bien.
  //
  // El carrito se guarda por local: si alguien abre dos menús distintos en el
  // mismo navegador, cada uno mantiene el suyo sin mezclarse.
  return (
    <div
      data-tema={dataTema}
      className="min-h-screen bg-papel-suave text-tinta"
      style={
        paleta
          ? ({
              "--brand": paleta.brand,
              "--brand-dark": paleta.brandDark,
              "--brand-light": paleta.brandLight,
              "--brand-tinte": paleta.brandTinte,
              "--brand-texto": paleta.brandTexto,
            } as React.CSSProperties)
          : undefined
      }
    >
      <CartProvider claveLocal={local.slug}>{children}</CartProvider>
    </div>
  );
}
