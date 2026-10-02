import { pantallaConPermiso } from "@/lib/auth";
import { BotonEnlace, Cabecera } from "@/components/ui";
import { PruebaGestos } from "./PruebaGestos";

export const dynamic = "force-dynamic";

/**
 * La prueba de la cámara del Registro de asistencia: comprobar que reconoce a una persona de verdad (pide
 * gestos al azar: parpadear, abrir la boca, sonreír, girar la cabeza) en el celular real y con la luz del
 * local. Sirve para ver cómo anda ANTES de dejar el celular fijo en la pared. No guarda nada.
 */
export default async function PruebaAsistenciaPage() {
  await pantallaConPermiso("asistencia.gestionar");

  return (
    <div>
      <Cabecera
        titulo="Prueba de la cámara"
        bajada="Comprobá que reconoce a una persona de verdad (parpadeo, boca, sonrisa y giro de cabeza) en el celular y con la luz de tu local."
        acciones={
          <BotonEnlace href="/admin/asistencia/celular" tono="navegar" tam="md">
            Volver al celular fijo
          </BotonEnlace>
        }
      />
      <PruebaGestos />
    </div>
  );
}
