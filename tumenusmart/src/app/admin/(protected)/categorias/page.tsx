import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { pantallaConPermiso } from "@/lib/auth";
import { puede } from "@/lib/permisos";
import { categoriaOcultaPorHorario } from "@/lib/horario-atencion";
import { Cabecera } from "@/components/ui";
import { CategoriasMaestroDetalle } from "./CategoriasMaestroDetalle";

export const dynamic = "force-dynamic";

export default async function AdminCategoriasPage({
  searchParams,
}: {
  searchParams: Promise<{ categoria?: string }>;
}) {
  // El empleado ve las categorías para entender la carta, pero no las toca.
  //
  // Este chequeo tiene que estar acá y no solo en el layout: layout y página
  // se renderizan en paralelo, así que una sesión vencida podía terminar en
  // el `throw` de idLocalActual() de acá abajo antes de que el layout
  // llegara a redirigir a /admin/login — un error real en vez de un
  // redirect silencioso.
  const sesion = await pantallaConPermiso("categorias.ver");
  const puedeEditar = puede(sesion.rol, "categorias.editar");

  // Todas las consultas de acá abajo quedan atadas a este local.
  const prisma = prismaDelLocal(await idLocalActual());

  const { categoria: categoriaParam } = await searchParams;

  const categorias = await prisma.category.findMany({
    // El desempate por createdAt importa: sin él, con órdenes repetidas la
    // lista podría salir en distinto orden en cada carga y las flechas
    // moverían la categoría equivocada.
    orderBy: [{ orden: "asc" }, { createdAt: "asc" }],
    include: { _count: { select: { productos: true } } },
  });
  // Los bloqueos de horario solo los ve (y edita) quien puede editar.
  const tramos = puedeEditar
    ? await prisma.categoriaHorario.findMany({ orderBy: [{ diaSemana: "asc" }, { abre: "asc" }] })
    : [];

  // La categoría de la dirección (enlaces viejos a /categorias/<id>/horario) solo se abre si es de este local.
  const abiertaInicialId = categoriaParam && categorias.some((c) => c.id === categoriaParam) ? categoriaParam : null;

  return (
    <div>
      <Cabecera
        titulo="Categorías"
        bajada="El orden de esta lista es el orden en que las ve tu cliente en la carta. Movelas con las flechas y hacé doble clic en una para ver su información completa."
      />

      <CategoriasMaestroDetalle
        categorias={categorias.map((c) => {
          const tramosDeCategoria = tramos.filter((t) => t.categoryId === c.id);
          return {
            id: c.id,
            nombre: c.nombre,
            activa: c.activa,
            cantidadProductos: c._count.productos,
            ocultaAhora: categoriaOcultaPorHorario(tramosDeCategoria),
            tramos: tramosDeCategoria.map((t) => ({ id: t.id, diaSemana: t.diaSemana, abre: t.abre, cierra: t.cierra })),
          };
        })}
        puedeEditar={puedeEditar}
        abiertaInicialId={abiertaInicialId}
      />
    </div>
  );
}
