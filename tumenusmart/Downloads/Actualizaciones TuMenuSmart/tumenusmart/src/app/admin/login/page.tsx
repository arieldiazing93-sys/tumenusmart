import { iniciarSesionAdmin } from "./actions";

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <h1 className="mb-1 text-xl font-bold text-neutral-900">TuMenuSmart</h1>
      <p className="mb-6 text-sm text-neutral-500">Panel admin</p>
      <form action={iniciarSesionAdmin} className="flex flex-col gap-4">
        <input
          type="password"
          name="password"
          required
          autoFocus
          placeholder="Contraseña"
          className="w-full rounded-lg border border-neutral-300 px-3 py-2"
        />
        {error && (
          <p className="text-sm text-red-600">Contraseña incorrecta.</p>
        )}
        <button
          type="submit"
          className="rounded-lg bg-brand px-4 py-2 font-medium text-white hover:bg-brand-dark"
        >
          Entrar
        </button>
      </form>
    </main>
  );
}
