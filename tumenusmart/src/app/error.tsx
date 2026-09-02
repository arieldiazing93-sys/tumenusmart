"use client";

import Link from "next/link";

// Red de contención genérica: atrapa lo que no cae bajo [slug]/error.tsx
// (la portada, el panel admin, cualquier ruta suelta). El registro del
// error ya ocurrió solo, vía src/instrumentation.ts — acá solo se decide
// qué ve la persona mientras tanto.
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 text-4xl" aria-hidden="true">
        ⚠️
      </div>
      <h1 className="mb-2 text-[1.2rem] font-semibold tracking-titular text-tinta">
        Algo salió mal
      </h1>
      <p className="text-[0.9rem] text-tinta-media">
        Fue un problema pasajero. Probá de nuevo — si sigue pasando, avisale al negocio.
      </p>
      <div className="mt-6 flex gap-3">
        <button
          type="button"
          onClick={reset}
          className="inline-flex h-10 items-center rounded-lg bg-brand px-5 text-[0.88rem] font-semibold text-white transition-colors hover:bg-brand-dark"
        >
          Reintentar
        </button>
        <Link
          href="/"
          className="inline-flex h-10 items-center rounded-lg border border-linea px-5 text-[0.88rem] font-semibold text-tinta transition-colors hover:border-brand hover:text-brand"
        >
          Ir a TuMenuSmart
        </Link>
      </div>
    </main>
  );
}
