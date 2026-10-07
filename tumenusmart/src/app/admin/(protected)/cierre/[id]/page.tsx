import { redirect } from "next/navigation";

/**
 * Las rendiciones de repartidores ya no existen: la plata del delivery entra al turno cuando la caja cobra la cuenta. Un marcador viejo
 * lleva al Servicio delivery.
 */
export default function RendicionRetiradaPage() {
  redirect("/admin/delivery");
}
