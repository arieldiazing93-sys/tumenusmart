import { notFound } from "next/navigation";
import { pantallaConPermiso } from "@/lib/auth";
import { Volver } from "@/components/Volver";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import {
  NOMBRES_DIA,
  DIAS_ORDENADOS,
  categoriaOcultaPorHorario,
} from "@/lib/horario-atencion";
import { EliminarTramoCategoriaBoton } from "../EliminarTramoCategoriaBoton";
import { AgregarTramoCategoriaForm } from "../AgregarTramoCategoriaForm";

export const dynamic = "force-dynamic";

export default async function HorarioCategoriaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await pantallaConPermiso("categorias.editar");

  // Todas las consultas de acá abajo quedan atadas a este local.
  const prisma = prismaDelLocal(await idLocalActual());

  const { id: categoryId } = await params;

  const [categoria, tramos] = await Promise.all([
    prisma.category.findUnique({ where: { id: categoryId }, select: { nombre: true } }),
    prisma.categoriaHorario.findMany({
      where: { categoryId },
      orderBy: [{ diaSemana: "asc" }, { abre: "asc" }],
    }),
  ]);

  if (!categoria) notFound();

  const sinConfigurar = tramos.length === 0;
  const oculta = categoriaOcultaPorHorario(tramos);

  return (
    <div>
      <div className="mb-4">
        <Volver href="/admin/categorias" texto="Volver a categorías" />
      </div>

      <h1 className="mb-1 text-[1.4rem] font-semibold tracking-titular text-tinta">
        Horario de "{categoria.nombre}"
      </h1>
      <p className="mb-6 text-sm text-tinta-media">
        Por defecto, esta categoría se muestra siempre — esto es para el caso puntual en que
        NO querés venderla en ciertos días u horarios (ej: "Hamburguesas Simple" no se vende
        lunes ni martes). Cargá acá esos días/horarios de <strong>bloqueo</strong>: el resto
        del tiempo, la categoría sigue visible como siempre.
      </p>

      <div
        className={`mb-6 rounded-lg border p-4 ${
          sinConfigurar
            ? "border-linea bg-white"
            : oculta
              ? "border-aviso/30 bg-aviso-luz"
              : "border-exito/30 bg-exito-luz"
        }`}
      >
        {sinConfigurar ? (
          <p className="text-sm text-tinta-media">
            Todavía no cargaste ningún bloqueo, así que esta categoría se muestra{" "}
            <strong>siempre</strong>. Cargá los tramos de abajo solo si necesitás ocultarla en
            ciertos días u horas.
          </p>
        ) : oculta ? (
          <p className="text-sm font-medium text-aviso">
            🔴 Ahora mismo está OCULTA de la carta por el bloqueo que cargaste.
          </p>
        ) : (
          <p className="text-sm font-medium text-exito">
            🟢 Ahora mismo está VISIBLE en la carta (no estás dentro de ningún bloqueo).
          </p>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border border-linea bg-white">
        <div className="hidden border-b border-linea bg-papel-suave px-4 py-2 text-xs font-semibold uppercase tracking-wide text-tinta-media sm:flex">
          <span className="w-28 flex-none">Día</span>
          <span className="flex-1">Bloqueado</span>
          <span className="w-64 flex-none">Agregar bloqueo</span>
        </div>

        <div className="divide-y divide-linea-fina">
          {DIAS_ORDENADOS.map((dia) => {
            const delDia = tramos.filter((t) => t.diaSemana === dia);
            const sinBloqueos = delDia.length === 0;
            return (
              <div
                key={dia}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:flex-nowrap"
              >
                <span className="w-28 flex-none font-medium text-tinta">
                  {NOMBRES_DIA[dia]}
                </span>

                <div className="flex min-w-[160px] flex-1 flex-wrap items-center gap-1.5">
                  {sinBloqueos ? (
                    <span className="rounded-full bg-exito-luz px-2.5 py-0.5 text-xs font-medium text-exito">
                      Visible todo el día
                    </span>
                  ) : (
                    delDia.map((t) => {
                      const todoElDia = t.abre === "00:00" && t.cierra === "23:59";
                      return (
                        <span
                          key={t.id}
                          className="inline-flex items-center gap-1.5 rounded-full border border-aviso/30 bg-aviso-luz px-2.5 py-1 text-sm text-aviso"
                        >
                          {todoElDia ? "Todo el día" : `${t.abre}–${t.cierra}`}
                          {!todoElDia && t.cierra <= t.abre && (
                            <span className="text-[10px] text-tinta-suave">+1 día</span>
                          )}
                          <EliminarTramoCategoriaBoton categoryId={categoryId} id={t.id} />
                        </span>
                      );
                    })
                  )}
                </div>

                <AgregarTramoCategoriaForm categoryId={categoryId} dia={dia} diaLabel={NOMBRES_DIA[dia]} />
              </div>
            );
          })}
        </div>
      </div>

      <p className="mt-6 text-xs text-tinta-suave">
        Para bloquear un día entero (como lunes y martes en el ejemplo), tildá "Todo el día" al
        cargarlo. Si el bloqueo cruza la medianoche (ej: 19:00 a 01:00), cargalo tal cual — el
        sistema entiende que termina al día siguiente.
      </p>
    </div>
  );
}
