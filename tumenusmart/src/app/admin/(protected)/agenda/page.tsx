import { pantallaConPermiso } from "@/lib/auth";
import { Cabecera, Vacio } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * Agenda de la Reserva de turnos: la pantalla donde se ve quién viene, con
 * quién y a qué hora. Por ahora es solo la puerta de entrada de la sección;
 * el contenido se va armando por partes.
 */
export default async function AgendaPage() {
  await pantallaConPermiso("agenda.ver");

  return (
    <div className="flex flex-col gap-3">
      <Cabecera
        titulo="Agenda"
        bajada="Los turnos de tus clientes: quién viene, con quién y a qué hora."
      />
      <Vacio
        titulo="Todavía no hay turnos"
        detalle="Esta sección se está armando. Cuando esté lista, acá se van a ver y a cargar los turnos."
      />
    </div>
  );
}
