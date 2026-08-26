import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { sesionActual } from "@/lib/auth";
import { FormularioPassword } from "./FormularioPassword";

export const dynamic = "force-dynamic";

export default async function MiCuentaPage() {
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

      {sesion.debeCambiarPassword && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3">
          <p className="text-sm text-amber-900">
            <strong>Todavía usás la contraseña que te entregamos.</strong> Esa contraseña
            viajó por WhatsApp, así que la vio más de una persona. Cambiala por una tuya.
          </p>
        </div>
      )}

      <FormularioPassword />
    </div>
  );
}
