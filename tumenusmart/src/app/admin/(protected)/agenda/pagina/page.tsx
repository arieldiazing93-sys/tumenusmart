import { pantallaConPermiso } from "@/lib/auth";
import { idLocalActual, localActual } from "@/lib/local-actual";
import { prismaDelLocal } from "@/lib/prisma-local";
import { Cabecera } from "@/components/ui";
import { datosIniciales } from "@/lib/pagina-reservas";
import { EditorPagina } from "./EditorPagina";

export const dynamic = "force-dynamic";

/**
 * La página pública de reservas del negocio: lo que ve el cliente en
 * /turnos/<dirección> — foto de perfil, nombre, contacto, redes, galería,
 * colores y los datos que se le piden al reservar. Solo el dueño la arma.
 *
 * Es aparte de la configuración base del sistema: tiene sus propios datos. La
 * primera vez, mientras no haya nada guardado, propone el nombre del negocio y
 * una dirección armada con él; recién cuenta cuando se aprieta Guardar.
 */
export default async function PaginaReservasPage() {
  await pantallaConPermiso("agenda.configurar");
  const db = prismaDelLocal(await idLocalActual());

  const [fila, local] = await Promise.all([db.paginaReservas.findFirst(), localActual()]);

  return (
    <div className="flex flex-col gap-3">
      <Cabecera
        titulo="Página de reservas"
        bajada="La página que ven tus clientes para reservar. Compartí el link en tus redes y por WhatsApp."
      />
      <EditorPagina inicial={datosIniciales(fila, local.nombre)} yaGuardada={fila !== null} />
    </div>
  );
}
