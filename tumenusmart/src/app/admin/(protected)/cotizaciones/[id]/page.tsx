import { notFound } from "next/navigation";
import { pantallaConPermiso } from "@/lib/auth";
import { numeroDeCotizacion } from "@/lib/cotizacion";
import { BotonEnlace, Cabecera, clasesBoton } from "@/components/ui";
import { Volver } from "@/components/Volver";
import { cargarCotizacion } from "../cargar-cotizacion";
import { DocumentoCotizacion } from "../DocumentoCotizacion";
import { EliminarCotizacionBoton } from "../EliminarCotizacionBoton";

export const dynamic = "force-dynamic";

/** La vista previa del presupuesto: exactamente el documento que sale en el PDF. */
export default async function CotizacionDetallePage({ params }: { params: Promise<{ id: string }> }) {
  await pantallaConPermiso("cotizaciones.gestionar");
  const { id } = await params;

  const cargada = await cargarCotizacion(id);
  if (!cargada) notFound();
  const { cotizacion, documento } = cargada;

  return (
    <div className="flex flex-col gap-4">
      <Volver href="/admin/cotizaciones" texto="Volver a Cotizaciones" className="self-start" />
      <Cabecera
        titulo={`Cotización N° ${numeroDeCotizacion(cotizacion.numero)}`}
        bajada={`Para ${cotizacion.clienteNombre}. Revisala y sacá el PDF para enviárselo al cliente.`}
        acciones={
          <>
            <a
              href={`/admin/cotizaciones/${cotizacion.id}/imprimir`}
              target="_blank"
              rel="noopener noreferrer"
              className={clasesBoton("principal")}
            >
              Ver / PDF
            </a>
            <BotonEnlace href={`/admin/cotizaciones/${cotizacion.id}/editar`} tono="navegar">
              Editar
            </BotonEnlace>
            <EliminarCotizacionBoton cotizacionId={cotizacion.id} />
          </>
        }
      />

      <DocumentoCotizacion d={documento} />
    </div>
  );
}
