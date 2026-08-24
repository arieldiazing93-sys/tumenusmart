import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { sesionActual } from "@/lib/auth";
import { cambiarMiPassword } from "./actions";

export const dynamic = "force-dynamic";

const MENSAJES: Record<string, string> = {
  actual: "La contraseña actual no es correcta.",
  repetida: "Las dos contraseñas nuevas no coinciden.",
  debil: "La contraseña tiene que tener al menos 8 caracteres, con letras y números.",
  igual: "La contraseña nueva tiene que ser distinta de la actual.",
};

const CAMPO =
  "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand";

export default async function MiCuentaPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; guardado?: string }>;
}) {
  const { error, guardado } = await searchParams;
  const sesion = await sesionActual();
  if (!sesion) redirect("/admin/login");

  const local = sesion.storeId
    ? await prisma.store.findUnique({
        where: { id: sesion.storeId },
        select: { nombre: true, slug: true },
      })
    : null;

  return (
    <div className="max-w-md">
      <h1 className="mb-1 text-xl font-bold text-neutral-900">Mi cuenta</h1>
      <p className="mb-6 text-sm text-neutral-500">
        {sesion.email}
        {" · "}
        {sesion.rol === "superadmin"
          ? "Administrador de todos los locales"
          : local
            ? `${local.nombre} (/${local.slug})`
            : "Sin local asignado"}
      </p>

      {guardado && (
        <p className="mb-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
          Listo, tu contraseña quedó cambiada.
        </p>
      )}

      {error && (
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {MENSAJES[error] ?? "No se pudo cambiar la contraseña."}
        </p>
      )}

      <form
        action={cambiarMiPassword}
        className="flex flex-col gap-3 rounded-lg border border-neutral-200 bg-white p-4"
      >
        <h2 className="text-sm font-semibold text-neutral-800">Cambiar mi contraseña</h2>

        <label className="flex flex-col gap-1 text-sm text-neutral-600">
          Contraseña actual
          <input
            type="password"
            name="actual"
            required
            autoComplete="current-password"
            className={CAMPO}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-neutral-600">
          Contraseña nueva
          <input
            type="password"
            name="nueva"
            required
            autoComplete="new-password"
            className={CAMPO}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-neutral-600">
          Repetila
          <input
            type="password"
            name="repetida"
            required
            autoComplete="new-password"
            className={CAMPO}
          />
        </label>

        <button
          type="submit"
          className="mt-1 self-start rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
        >
          Guardar
        </button>
      </form>
    </div>
  );
}
