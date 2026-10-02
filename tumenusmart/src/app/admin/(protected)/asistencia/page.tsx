import { pantallaConPermiso } from "@/lib/auth";
import { Cabecera } from "@/components/ui";
import { PruebaGestos } from "./PruebaGestos";

export const dynamic = "force-dynamic";

/**
 * Registro de asistencia — por ahora solo la PRUEBA de la parte más delicada: que la cámara
 * reconozca que quien marca es una persona de verdad (pide gestos al azar: parpadear, abrir
 * la boca, sonreír, girar la cabeza). Sirve para probarlo en el celular real, con la luz del
 * local, antes de armar el resto (empleados, marcaciones y reportes). No guarda nada.
 */
export default async function AsistenciaPage() {
  await pantallaConPermiso("agenda.configurar");

  return (
    <div>
      <Cabecera
        titulo="Registro de asistencia"
        bajada="Prueba de la cámara: comprobá que reconoce a una persona de verdad (parpadeo, boca, sonrisa y giro de cabeza) en el celular y con la luz de tu local."
      />
      <PruebaGestos />
    </div>
  );
}
