import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { completarCampos, normalizarTema } from "@/lib/pagina-reservas";
import { prisma } from "@/lib/prisma";
import type { CategoriaPublica } from "@/lib/reserva-cliente";
import { cargarPaginaPublica, cargarPersonalPublico, cargarServiciosReservables } from "@/lib/reservas-publicas";
import { claveDiaAsuncion } from "@/lib/timezone";
import { variablesDePagina } from "../marco";
import { AsistenteReserva } from "./AsistenteReserva";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const pagina = await cargarPaginaPublica(slug);
  return { title: pagina ? `Crear cita — ${pagina.nombre}` : "Reservas" };
}

/**
 * La reserva paso a paso: servicios, profesional, día y hora, y los datos del
 * cliente. Esta página solo junta lo que se ofrece (servicios con al menos un
 * profesional activo, y el personal); la disponibilidad de horas se pide desde el
 * asistente a medida que el cliente elige, para que siempre esté al día.
 */
export default async function ReservarPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const pagina = await cargarPaginaPublica(slug);
  if (!pagina) notFound();

  const [reservables, personal] = await Promise.all([
    cargarServiciosReservables(prisma, pagina.storeId),
    cargarPersonalPublico(prisma, pagina.storeId),
  ]);

  // Agrupados por categoría, en el orden de las categorías.
  const categorias: CategoriaPublica[] = [];
  for (const s of [...reservables].sort((a, b) => a.categoriaOrden - b.categoriaOrden)) {
    let categoria = categorias.find((c) => c.id === s.categoryId);
    if (!categoria) {
      categoria = { id: s.categoryId, nombre: s.categoriaNombre, servicios: [] };
      categorias.push(categoria);
    }
    categoria.servicios.push({
      id: s.id,
      nombre: s.nombre,
      duracionMin: s.duracionMin,
      bufferMin: s.bufferMin,
      precio: s.precio,
      tipoPrecio: s.tipoPrecio,
      personalIds: s.personalIds,
    });
  }

  return (
    <div
      data-tema={normalizarTema(pagina.tema)}
      style={variablesDePagina(pagina.colorPrimario)}
      className="min-h-screen bg-papel-suave text-tinta"
    >
      <AsistenteReserva
        slug={pagina.slug}
        negocio={pagina.nombre}
        categorias={categorias}
        personal={personal}
        campos={completarCampos(pagina.campos)}
        hoy={claveDiaAsuncion(new Date())}
      />
    </div>
  );
}
