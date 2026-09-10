import { notFound } from "next/navigation";
import { pantallaConPermiso } from "@/lib/auth";
import { Volver } from "@/components/Volver";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import {
  NOMBRES_DIA,
  DIAS_ORDENADOS,
  calcularEstadoAtencion,
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

  const estado = calcularEstadoAtencion(tramos);
  const sinConfigurar = tramos.length === 0;

  return (
    <div>
      <div className="mb-4">
        <Volver href="/admin/categorias" texto="Volver a categorías" />
      </div>

      <h1 className="mb-1 text-[1.4rem] font-semibold tracking-titular text-tinta">
        Horario de "{categoria.nombre}"
      </h1>
      <p className="mb-6 text-sm text-tinta-media">
        Cargá los días y horarios en que esta categoría se muestra en la carta — por ejemplo,
        una categoría de pizzas que solo se vende de miércoles a domingo. Un día sin tramos
        queda <strong>oculto ese día</strong>, aunque el resto del local esté abierto. Sin
        ningún tramo cargado, la categoría se muestra siempre.
      </p>

      <div
        className={`mb-6 rounded-lg border p-4 ${
          sinConfigurar
            ? "border-linea bg-white"
            : estado.abierto
              ? "border-exito/30 bg-exito-luz"
              : "border-aviso/30 bg-aviso-luz"
        }`}
      >
        {sinConfigurar ? (
          <p className="text-sm text-tinta-media">
            Todavía no cargaste ningún horario, así que esta categoría se muestra{" "}
            <strong>siempre</strong>. Cargá los tramos de abajo para restringirla a ciertos
            días y horas.
          </p>
        ) : (
          <p className="text-sm font-medium">
            {estado.abierto ? (
              <span className="text-exito">🟢 Ahora mismo figura VISIBLE en la carta</span>
            ) : (
              <span className="text-aviso">
                🔴 Ahora mismo figura OCULTA de la carta
                {estado.proximaApertura ? ` — vuelve ${estado.proximaApertura}` : ""}
              </span>
            )}
          </p>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border border-linea bg-white">
        <div className="hidden border-b border-linea bg-papel-suave px-4 py-2 text-xs font-semibold uppercase tracking-wide text-tinta-media sm:flex">
          <span className="w-28 flex-none">Día</span>
          <span className="flex-1">Horarios</span>
          <span className="w-64 flex-none">Agregar tramo</span>
        </div>

        <div className="divide-y divide-linea-fina">
          {DIAS_ORDENADOS.map((dia) => {
            const delDia = tramos.filter((t) => t.diaSemana === dia);
            const oculto = delDia.length === 0;
            return (
              <div
                key={dia}
                className={`flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:flex-nowrap ${
                  oculto ? "bg-papel-suave/60" : ""
                }`}
              >
                <span className="w-28 flex-none font-medium text-tinta">
                  {NOMBRES_DIA[dia]}
                </span>

                <div className="flex min-w-[160px] flex-1 flex-wrap items-center gap-1.5">
                  {oculto ? (
                    <span className="rounded-full bg-linea px-2.5 py-0.5 text-xs font-medium text-tinta-media">
                      Oculta ese día
                    </span>
                  ) : (
                    delDia.map((t) => (
                      <span
                        key={t.id}
                        className="inline-flex items-center gap-1.5 rounded-full border border-linea px-2.5 py-1 text-sm"
                      >
                        {t.abre}–{t.cierra}
                        {t.cierra <= t.abre && (
                          <span className="text-[10px] text-tinta-suave">+1 día</span>
                        )}
                        <EliminarTramoCategoriaBoton categoryId={categoryId} id={t.id} />
                      </span>
                    ))
                  )}
                </div>

                <AgregarTramoCategoriaForm categoryId={categoryId} dia={dia} diaLabel={NOMBRES_DIA[dia]} />
              </div>
            );
          })}
        </div>
      </div>

      <p className="mt-6 text-xs text-tinta-suave">
        Si querés que esta categoría se vea toda la semana pero solo por la noche, cargá el
        mismo horario los 7 días. Si cierra después de medianoche (ej: 19:00 a 01:00), cargá el
        tramo tal cual — el sistema entiende que el cierre cae al día siguiente.
      </p>
    </div>
  );
}
