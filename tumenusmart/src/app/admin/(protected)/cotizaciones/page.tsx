import Link from "next/link";
import { pantallaConPermiso } from "@/lib/auth";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { formatearGuarani } from "@/lib/format";
import { numeroDeCotizacion, validaHasta } from "@/lib/cotizacion";
import { claveDiaAsuncion, ZONA_NEGOCIO } from "@/lib/timezone";
import { BotonEnlace, Cabecera, Campo, Entrada, Pastilla, Tabla, Td, Th, Tr, Vacio, clasesBoton } from "@/components/ui";

export const dynamic = "force-dynamic";

function dia(fecha: Date): string {
  return fecha.toLocaleDateString("es-PY", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: ZONA_NEGOCIO,
  });
}

export default async function CotizacionesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await pantallaConPermiso("cotizaciones.gestionar");
  const prisma = prismaDelLocal(await idLocalActual());

  const { q } = await searchParams;
  const texto = q?.trim() ?? "";
  const numeroBuscado = /^\d{1,9}$/.test(texto) ? Number(texto) : null;

  const cotizaciones = await prisma.cotizacion.findMany({
    where: texto
      ? {
          OR: [
            { clienteNombre: { contains: texto, mode: "insensitive" } },
            { clienteIdentificacion: { contains: texto, mode: "insensitive" } },
            ...(numeroBuscado != null ? [{ numero: numeroBuscado }] : []),
          ],
        }
      : {},
    orderBy: { numero: "desc" },
    take: 200,
    select: {
      id: true,
      numero: true,
      fecha: true,
      validezDias: true,
      clienteNombre: true,
      total: true,
      _count: { select: { items: true } },
    },
  });

  const hoy = claveDiaAsuncion(new Date());

  return (
    <div className="flex flex-col gap-4">
      <Cabecera
        titulo="Cotizaciones"
        bajada="Armá un presupuesto eligiendo los productos o servicios que vendés, y sacalo en PDF para enviárselo al cliente."
        acciones={<BotonEnlace href="/admin/cotizaciones/nueva">+ Nueva cotización</BotonEnlace>}
      />

      <form method="get" className="flex flex-wrap items-end gap-3">
        <Campo etiqueta="Buscar" className="w-full sm:w-72">
          <Entrada name="q" defaultValue={texto} placeholder="Cliente, RUC o N° de presupuesto" />
        </Campo>
        <button type="submit" className={clasesBoton("suave")}>
          Buscar
        </button>
        {texto && (
          <Link href="/admin/cotizaciones" className={clasesBoton("fantasma")}>
            Limpiar
          </Link>
        )}
      </form>

      {cotizaciones.length === 0 ? (
        <Vacio
          titulo={texto ? "Ningún presupuesto coincide con esa búsqueda" : "Todavía no armaste ningún presupuesto"}
          detalle={texto ? undefined : "Creá el primero con el botón de arriba."}
        />
      ) : (
        <Tabla>
          <thead>
            <tr>
              <Th>N°</Th>
              <Th>Fecha</Th>
              <Th>Cliente</Th>
              <Th>Ítems</Th>
              <Th>Total</Th>
              <Th>Validez</Th>
              <Th>
                <span className="sr-only">Acciones</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {cotizaciones.map((c) => {
              const hasta = validaHasta(c.fecha, c.validezDias);
              const vigente = claveDiaAsuncion(hasta) >= hoy;
              return (
                <Tr key={c.id}>
                  <Td className="cifra font-medium text-tinta">{numeroDeCotizacion(c.numero)}</Td>
                  <Td>{dia(c.fecha)}</Td>
                  <Td className="font-medium text-tinta">{c.clienteNombre}</Td>
                  <Td>{c._count.items}</Td>
                  <Td className="cifra font-semibold text-tinta">{formatearGuarani(Number(c.total))}</Td>
                  <Td>
                    {vigente ? (
                      <Pastilla color="exito">Vigente hasta {dia(hasta)}</Pastilla>
                    ) : (
                      <Pastilla>Vencida el {dia(hasta)}</Pastilla>
                    )}
                  </Td>
                  <Td>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <BotonEnlace href={`/admin/cotizaciones/${c.id}`} tono="navegar" tam="sm">
                        Ver
                      </BotonEnlace>
                      <a
                        href={`/admin/cotizaciones/${c.id}/imprimir`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={clasesBoton("principal", "sm")}
                      >
                        PDF
                      </a>
                    </div>
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Tabla>
      )}
    </div>
  );
}
