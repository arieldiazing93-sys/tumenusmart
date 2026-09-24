import { pantallaConPermiso } from "@/lib/auth";
import { Cabecera } from "@/components/ui";
import { Volver } from "@/components/Volver";
import { CotizacionForm } from "../CotizacionForm";

export const dynamic = "force-dynamic";

export default async function NuevaCotizacionPage() {
  await pantallaConPermiso("cotizaciones.gestionar");

  return (
    <div className="flex flex-col gap-4">
      <Volver href="/admin/cotizaciones" texto="Volver a Cotizaciones" className="self-start" />
      <Cabecera
        titulo="Nueva cotización"
        bajada="Elegí al cliente y los productos o servicios. Al guardar, ya podés sacar el PDF para enviárselo."
      />
      <CotizacionForm />
    </div>
  );
}
