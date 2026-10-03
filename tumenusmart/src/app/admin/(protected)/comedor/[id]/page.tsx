import { redirect } from "next/navigation";
import { pantallaConPermiso } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * El detalle de una cuenta ahora se abre a la derecha de la lista de mesas (doble clic en la mesa, en Servicio comedor).
 * Esta dirección se deja para los enlaces que ya existían: lleva directo a esa pantalla.
 */
export default async function CuentaMesaPage() {
  await pantallaConPermiso("comedor.ver");
  redirect("/admin/comedor");
}
