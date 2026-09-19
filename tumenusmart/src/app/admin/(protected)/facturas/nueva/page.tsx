import { pantallaConPermiso } from "@/lib/auth";
import { Cabecera, Tarjeta } from "@/components/ui";
import { Volver } from "@/components/Volver";
import { NuevaFacturaForm } from "./NuevaFacturaForm";

export const dynamic = "force-dynamic";

/**
 * Emitir una factura nueva reusando un pedido/cuenta cuya factura anterior
 * se anuló sola (remisión — ver Fase 11 del plan). No es un alta de venta:
 * no se cargan productos acá, se ADJUNTA una cuenta ya existente.
 */
export default async function NuevaFacturaPage() {
  await pantallaConPermiso("pos.verHistorico");

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-4">
        <Volver href="/admin/facturas" texto="Volver a Facturas" />
      </div>
      <Cabecera
        titulo="Nueva factura"
        bajada="Para cuando una factura se anuló por un dato mal cargado (RUC, razón social) y hay que volver a emitirla con los datos corregidos, sobre la misma cuenta."
      />
      <Tarjeta className="shadow-sm">
        <NuevaFacturaForm />
      </Tarjeta>
    </div>
  );
}
