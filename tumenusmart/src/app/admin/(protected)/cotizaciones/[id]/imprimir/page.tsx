import { notFound } from "next/navigation";
import { pantallaConPermiso } from "@/lib/auth";
import { cargarCotizacion } from "../../cargar-cotizacion";
import { DocumentoCotizacion } from "../../DocumentoCotizacion";
import { ImprimirBoton } from "../../../estadisticas/imprimir/ImprimirBoton";

export const dynamic = "force-dynamic";

/** Versión imprimible del presupuesto — "Imprimir / Guardar como PDF" desde el navegador. */
export default async function ImprimirCotizacionPage({ params }: { params: Promise<{ id: string }> }) {
  await pantallaConPermiso("cotizaciones.gestionar");
  const { id } = await params;

  const cargada = await cargarCotizacion(id);
  if (!cargada) notFound();

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 print:max-w-none print:px-0 print:py-0">
      <div className="mb-6 flex justify-end print:hidden">
        <ImprimirBoton />
      </div>
      <DocumentoCotizacion d={cargada.documento} />
    </div>
  );
}
