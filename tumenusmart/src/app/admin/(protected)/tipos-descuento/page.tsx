import { pantallaConPermiso } from "@/lib/auth";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { cargarTiposDescuento } from "@/lib/tipos-descuento-servidor";
import { Cabecera } from "@/components/ui";
import { TiposDescuentoPanel } from "./TiposDescuentoPanel";

export const dynamic = "force-dynamic";

/**
 * Tipos de descuentos (Ajustes): los descuentos con nombre y porcentaje fijo que se eligen al vender ("Cortesía" 100 %, "Tarjeta" 20 %…).
 * Las reglas están en src/lib/tipos-descuento.ts; acá los crea y los edita el dueño.
 */
export default async function TiposDescuentoPage() {
  await pantallaConPermiso("configuracion.editar");
  const db = prismaDelLocal(await idLocalActual());
  const tipos = await cargarTiposDescuento(db, false);

  return (
    <div>
      <Cabecera
        titulo="Tipos de descuentos"
        bajada="Descuentos con nombre y porcentaje fijo que se eligen al vender: Cortesía (100 %), Tarjeta (20 %)… Al descontar una cuenta por porcentaje, el cajero elige uno de esta lista."
      />
      <TiposDescuentoPanel tipos={tipos} />
    </div>
  );
}
