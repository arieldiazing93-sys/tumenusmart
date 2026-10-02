import { pantallaConPermiso } from "@/lib/auth";
import { BotonEnlace, Cabecera } from "@/components/ui";
import { PruebaGestos } from "./PruebaGestos";

export const dynamic = "force-dynamic";

/**
 * La prueba de la cámara del Registro de asistencia: muestra en vivo si la cámara ve la cara (y qué tan bien: a qué
 * distancia, con cuánta luz) en el celular real y con la luz del local, para ver cómo anda ANTES de dejarlo fijo en la
 * pared. Los gestos (parpadear, abrir la boca…) ya no se piden al marcar: quedan acá solo como una prueba extra.
 * No guarda nada.
 */
export default async function PruebaAsistenciaPage() {
  await pantallaConPermiso("asistencia.gestionar");

  return (
    <div>
      <Cabecera
        titulo="Prueba de la cámara"
        bajada="Comprobá cómo ve tu cara la cámara en el celular y con la luz de tu local: si la detecta, a qué distancia y con cuánta luz."
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
