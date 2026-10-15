import { pantallaConPermiso } from "@/lib/auth";
import { idLocalActual } from "@/lib/local-actual";
import { prismaDelLocal } from "@/lib/prisma-local";
import { BotonEnlace, Cabecera } from "@/components/ui";
import type { ColaboradorFila } from "@/lib/asistencia";
import { normalizarMetodoAsistencia } from "@/lib/asistencia";
import { normalizarDiasTrabajo } from "@/lib/ausencias";
import { prisma } from "@/lib/prisma";
import { tieneRostro } from "@/lib/reconocimiento-facial";
import { ListaColaboradores } from "./ListaColaboradores";

export const dynamic = "force-dynamic";

/**
 * Las personas que marcan su asistencia en el celular fijo del local. El dueño las da de alta EN PERSONA:
 * les saca la selfie de referencia (de ahí se guarda su rostro, que el celular compara al marcar) y les elige un PIN de 3 números.
 */
export default async function ColaboradoresPage() {
  await pantallaConPermiso("asistencia.gestionar");
  const idLocal = await idLocalActual();
  const db = prismaDelLocal(idLocal);
  // Cómo se marca en el local (Store no está entre los modelos por local: va con el cliente global y el id de la sesión).
  const local = await prisma.store.findUnique({ where: { id: idLocal }, select: { metodoAsistencia: true } });
  const metodo = normalizarMetodoAsistencia(local?.metodoAsistencia);

  const filas = await db.colaborador.findMany({
    // Los activos primero; entre ellos, por nombre.
    orderBy: [{ activo: "desc" }, { nombre: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      nombre: true,
      apellido: true,
      cargo: true,
      fotoUrl: true,
      horaEntrada: true,
      toleranciaMin: true,
      haceAlmuerzo: true,
      diasTrabajo: true,
      tipoPago: true,
      montoPago: true,
      activo: true,
      pinClave: true,
      rostro: true,
    },
  });

  // Del PIN y del rostro solo se sabe si lo tienen o no: ni la huella del PIN ni los números del rostro salen del servidor.
  const colaboradores: ColaboradorFila[] = filas.map(({ pinClave, rostro, diasTrabajo, ...f }) => ({
    ...f,
    diasTrabajo: normalizarDiasTrabajo(diasTrabajo),
    sinPin: pinClave === null,
    sinRostro: !tieneRostro(rostro),
  }));

  return (
    <div className="flex flex-col gap-3">
      <Cabecera
        titulo="Colaboradores"
        bajada={
          metodo === "pin"
            ? "Las personas que marcan entrada, almuerzo y salida en el celular fijo. Elegí el PIN de 3 números de cada una: es lo que la identifica (no puede repetirse). La selfie es opcional."
            : "Las personas que marcan entrada, almuerzo y salida en el celular fijo. Dalas de alta en persona: sacales la selfie y elegí su PIN de 3 números, que es lo que las identifica (no puede repetirse)."
        }
        acciones={
          <BotonEnlace href="/admin/asistencia/celular" tono="navegar" tam="md">
            Celular fijo
          </BotonEnlace>
        }
      />
      <ListaColaboradores colaboradores={colaboradores} metodo={metodo} />
    </div>
  );
}
