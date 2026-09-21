import { pantallaConPermiso } from "@/lib/auth";
import { notFound } from "next/navigation";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { Volver } from "@/components/Volver";
import { Tarjeta } from "@/components/ui";
import { BotonesMover } from "@/components/BotonesMover";
import { moverGrupoItem } from "../actions";
import { AgregarGrupoItemForm } from "./AgregarGrupoItemForm";
import { EditarNombreGrupoItem } from "./EditarNombreGrupoItem";
import { EditarCostoGrupoItem } from "./EditarCostoGrupoItem";
import { EditarPrecioExtraGrupoItem } from "./EditarPrecioExtraGrupoItem";
import { EditarFiscalGrupoItem } from "./EditarFiscalGrupoItem";
import { EliminarGrupoItemBoton } from "./EliminarGrupoItemBoton";

export const dynamic = "force-dynamic";

export default async function GrupoAgregadoDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await pantallaConPermiso("productos.editar");
  const prisma = prismaDelLocal(await idLocalActual());

  const { id } = await params;

  const grupo = await prisma.optionGroup.findUnique({
    where: { id },
    include: {
      items: { orderBy: [{ orden: "asc" }, { id: "asc" }] },
      _count: { select: { productos: true } },
    },
  });

  if (!grupo) notFound();

  return (
    <div className="flex flex-col gap-8">
      <div>
        <div className="mb-4">
          <Volver href="/admin/grupos-agregados" texto="Volver a Grupos de agregados" />
        </div>

        <div className="mb-4">
          <h1 className="text-[1.4rem] font-semibold tracking-titular text-tinta">{grupo.nombre}</h1>
          <p className="text-sm text-tinta-media">
            Adjuntado a {grupo._count.productos} producto(s). Corregir un ítem acá lo corrige en
            todos ellos a la vez.
          </p>
        </div>
      </div>

      <Tarjeta className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          {grupo.items.map((it, i) => (
            <div
              key={it.id}
              className="flex flex-col gap-2 rounded-lg border border-linea bg-white px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex flex-wrap items-center gap-2">
                <BotonesMover
                  id={it.id}
                  accion={moverGrupoItem}
                  esPrimero={i === 0}
                  esUltimo={i === grupo.items.length - 1}
                  etiqueta={it.nombre}
                />
                <EditarNombreGrupoItem
                  groupId={grupo.id}
                  itemId={it.id}
                  nombreActual={it.nombre}
                  sinCosto={it.costo == null}
                />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <EditarPrecioExtraGrupoItem
                  groupId={grupo.id}
                  itemId={it.id}
                  precioActual={Number(it.precioExtra)}
                />
                <EditarCostoGrupoItem
                  groupId={grupo.id}
                  itemId={it.id}
                  costoActual={it.costo != null ? Number(it.costo) : null}
                />
                <EditarFiscalGrupoItem
                  groupId={grupo.id}
                  itemId={it.id}
                  ivaActual={it.iva}
                  unidadMedidaActual={it.unidadMedida}
                />
                <EliminarGrupoItemBoton groupId={grupo.id} itemId={it.id} />
              </div>
            </div>
          ))}
          {grupo.items.length === 0 && (
            <p className="text-sm text-tinta-suave">Este grupo todavía no tiene ítems.</p>
          )}
        </div>

        <AgregarGrupoItemForm groupId={grupo.id} />
      </Tarjeta>
    </div>
  );
}
