"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Cubre todo el recorrido del cliente: carta, carrito, checkout, reservas,
// confirmación. Un error acá no debería verse distinto a una pantalla
// cualquiera del negocio — es la que más gente cruza, y en el peor momento
// posible (a mitad de un pedido).
//
// error.tsx solo recibe {error, reset}, no los params de la ruta — el slug
// sale del primer segmento de la URL, que es exactamente lo que ya usa
// localPorSlug() para resolver el local.
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const pathname = usePathname();
  const slug = pathname?.split("/")[1];

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 text-4xl" aria-hidden="true">
        ⚠️
      </div>
      <h1 className="mb-2 text-[1.2rem] font-semibold tracking-titular text-tinta">
        Algo salió mal
      </h1>
      <p className="text-[0.9rem] text-tinta-media">
        Fue un problema pasajero. Tu carrito sigue guardado en este celular — probá de
        nuevo.
      </p>
      <div className="mt-6 flex gap-3">
        <button
          type="button"
          onClick={reset}
          className="inline-flex h-10 items-center rounded-lg bg-brand px-5 text-[0.88rem] font-semibold text-white transition-colors hover:bg-brand-dark"
        >
          Reintentar
        </button>
        {slug && (
          <Link
            href={`/${slug}`}
            className="inline-flex h-10 items-center rounded-lg border border-linea px-5 text-[0.88rem] font-semibold text-tinta transition-colors hover:border-brand hover:text-brand"
          >
            Volver a la carta
          </Link>
        )}
      </div>
    </main>
  );
}
