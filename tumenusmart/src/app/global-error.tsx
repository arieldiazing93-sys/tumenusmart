"use client";

import "./globals.css";

// Único caso que error.tsx no puede cubrir: un error en el layout raíz
// mismo. Por eso reconstruye <html>/<body> a mano — está reemplazando todo
// lo que layout.tsx normalmente pone alrededor de la página.
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="es">
      <body>
        <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
          <div className="mb-4 text-4xl" aria-hidden="true">
            ⚠️
          </div>
          <h1 className="mb-2 text-[1.2rem] font-semibold tracking-titular text-tinta">
            Algo salió mal
          </h1>
          <p className="text-[0.9rem] text-tinta-media">
            Fue un problema pasajero. Probá de nuevo en un momento.
          </p>
          <button
            type="button"
            onClick={reset}
            className="mt-6 inline-flex h-10 items-center rounded-lg bg-brand px-5 text-[0.88rem] font-semibold text-white transition-colors hover:bg-brand-dark"
          >
            Reintentar
          </button>
        </main>
      </body>
    </html>
  );
}
