import Link from "next/link";

export const metadata = {
  title: "Página no encontrada — TuMenuSmart",
};

// Cubre tanto un link roto como el nombre de un local que no existe (o que
// nunca existió): localPorSlug() ya llama a notFound() para ese segundo
// caso, y esta pantalla es la que atrapa cualquiera de los dos.
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 text-4xl" aria-hidden="true">
        🔎
      </div>
      <h1 className="mb-2 text-[1.2rem] font-semibold tracking-titular text-tinta">
        No encontramos esta página
      </h1>
      <p className="text-[0.9rem] text-tinta-media">
        El link puede estar mal escrito o ya no existir. Revisá la dirección, o volvé
        a pedirle el enlace al negocio.
      </p>
      <Link
        href="/"
        className="mt-6 inline-flex h-10 items-center rounded-lg bg-brand px-5 text-[0.88rem] font-semibold text-white transition-colors hover:bg-brand-dark"
      >
        Ir a TuMenuSmart
      </Link>
    </main>
  );
}
