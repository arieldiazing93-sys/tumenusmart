import Link from "next/link";
import { pantallaConPermiso } from "@/lib/auth";
import { notFound } from "next/navigation";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { Volver } from "@/components/Volver";
import { Tarjeta, clasesBoton } from "@/components/ui";
import { BotonesMover } from "@/components/BotonesMover";
import { formatearGuarani } from "@/lib/format";
import { etiquetaIva } from "@/lib/iva";
import { etiquetaUnidadMedida } from "@/lib/unidad-medida";
import { moverModificadorDeGrupo } from "../actions";
import { BuscarProductoParaGrupo } from "@/components/BuscarProductoParaGrupo";
import { QuitarProductoDeGrupoBoton } from "@/components/QuitarProductoDeGrupoBoton";

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
      modificadores: {
        orderBy: [{ orden: "asc" }, { id: "asc" }],
        include: {
          product: {
            select: { id: true, nombre: true, precio: true, iva: true, unidadMedida: true, disponible: true },
          },
        },
      },
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
            Adjuntado a {grupo._count.productos} producto(s). Cada modificador es un producto real
            del catálogo — para corregirle el precio, el IVA o la unidad, editá el producto en su
            propia pantalla.
          </p>
        </div>
      </div>

      <Tarjeta className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          {grupo.modificadores.map((m, i) => (
            <div
              key={m.id}
              className="flex flex-col gap-2 rounded-lg border border-linea bg-white px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex flex-wrap items-center gap-2">
                <BotonesMover
                  id={m.id}
                  accion={moverModificadorDeGrupo}
                  esPrimero={i === 0}
                  esUltimo={i === grupo.modificadores.length - 1}
                  etiqueta={m.product.nombre}
                />
                <Link
                  href={`/admin/productos/${m.product.id}`}
                  className={clasesBoton("navegar", "sm")}
                >
                  {m.product.nombre}
                </Link>
                {!m.product.disponible && (
                  <span className="text-xs text-aviso">No disponible — no se ofrece ahora</span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs text-tinta-media">
                <span className="cifra">{formatearGuarani(Number(m.product.precio))}</span>
                <span>{etiquetaIva(m.product.iva)}</span>
                <span>{etiquetaUnidadMedida(m.product.unidadMedida)}</span>
                <QuitarProductoDeGrupoBoton groupId={grupo.id} productId={m.product.id} />
              </div>
            </div>
          ))}
          {grupo.modificadores.length === 0 && (
            <p className="text-sm text-tinta-suave">Este grupo todavía no tiene modificadores.</p>
          )}
        </div>

        <BuscarProductoParaGrupo groupId={grupo.id} />
      </Tarjeta>
    </div>
  );
}
