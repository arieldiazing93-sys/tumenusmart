import { pantallaConPermiso } from "@/lib/auth";
import { idLocalActual, localActual } from "@/lib/local-actual";
import { prismaDelLocal } from "@/lib/prisma-local";
import { Cabecera } from "@/components/ui";
import { datosIniciales } from "@/lib/pagina-reservas";
import { EditorPagina } from "../../agenda/pagina/EditorPagina";

export const dynamic = "force-dynamic";

/**
 * La página pública de reservas del complejo: lo que ve el cliente en /canchas/<dirección> — foto de perfil, nombre,
 * contacto, redes, galería, colores y los datos que se le piden al reservar. Solo el dueño la arma.
 *
 * Es la misma página del negocio que usa la Reserva de turnos (un negocio tiene una sola): lo que se cambia acá se ve
 * igual en las dos direcciones. La primera vez, mientras no haya nada guardado, propone el nombre del negocio y una
 * dirección armada con él; recién cuenta cuando se aprieta Guardar.
 */
export default async function PaginaCanchasPage() {
  await pantallaConPermiso("canchas.configurar");
  const db = prismaDelLocal(await idLocalActual());

  const [fila, local] = await Promise.all([db.paginaReservas.findFirst(), localActual()]);

  return (
    <div className="flex flex-col gap-3">
      <Cabecera
        titulo="Página de reservas"
        bajada="La página que ven tus clientes para reservar una cancha. Compartí el link en tus redes y por WhatsApp."
      />
      <EditorPagina inicial={datosIniciales(fila, local.nombre)} yaGuardada={fila !== null} rutaPublica="canchas" />
    </div>
  );
}
