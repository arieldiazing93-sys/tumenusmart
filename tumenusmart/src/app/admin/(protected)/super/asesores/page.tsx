import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { sesionActual } from "@/lib/auth";
import { Cabecera } from "@/components/ui";
import { AltaAsesor } from "./AltaAsesor";
import { ToggleAsesor } from "./ToggleAsesor";

export const dynamic = "force-dynamic";

/**
 * Alta y baja de los asesores comerciales de TuMenuSmart (no de un local
 * puntual — esto es tu propio equipo de ventas). Desde acá salen los
 * nombres que después se eligen al dar de alta un local en Cartera.
 */
export default async function AsesoresPage() {
  const sesion = await sesionActual();
  if (!sesion || sesion.rol !== "superadmin") redirect("/admin/pedidos");

  const asesores = await prisma.asesor.findMany({
    orderBy: [{ activo: "desc" }, { nombre: "asc" }],
    include: { _count: { select: { locales: true } } },
  });

  return (
    <div>
      <Cabecera
        titulo="Asesores comerciales"
        bajada="Tu equipo de ventas. Cada local se le puede asignar a uno al darlo de alta desde Cartera."
      />

      {/* Mismo botón corto y verde que "Dar de alta un local nuevo" en Cartera. */}
      <details className="group mb-6">
        <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-lg border border-exito/30 bg-exito-luz px-3 py-1.5 text-sm font-medium text-exito transition-colors hover:bg-exito hover:text-white">
          <span aria-hidden="true">+</span>
          Dar de alta un asesor nuevo
          <span
            aria-hidden="true"
            className="text-xs transition-transform duration-150 group-open:rotate-180"
          >
            ▼
          </span>
        </summary>
        <div className="mt-3 rounded-lg border border-linea bg-white p-4">
          <AltaAsesor />
        </div>
      </details>

      <div className="flex flex-col gap-2">
        {asesores.map((a) => (
          <div
            key={a.id}
            className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border border-linea bg-white px-4 py-3 ${
              a.activo ? "" : "opacity-60"
            }`}
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-tinta">{a.nombre}</span>
                {!a.activo && (
                  <span className="rounded-full bg-papel-hundido px-2 py-0.5 text-xs text-tinta-media">
                    Inactivo
                  </span>
                )}
                <span className="rounded-full bg-azul-luz px-2 py-0.5 text-xs text-azul-oscuro">
                  {a._count.locales} {a._count.locales === 1 ? "local" : "locales"}
                </span>
              </div>
              <p className="mt-1 text-xs text-tinta-media">
                {a.ciudad} · {a.telefono} · {a.email}
              </p>
            </div>

            <ToggleAsesor id={a.id} activo={a.activo} />
          </div>
        ))}

        {asesores.length === 0 && (
          <p className="rounded-lg border border-dashed border-linea px-4 py-6 text-center text-sm text-tinta-media">
            Todavía no cargaste ningún asesor.
          </p>
        )}
      </div>
    </div>
  );
}
