import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { localPorToken } from "@/lib/asistencia-servidor";
import { prisma } from "@/lib/prisma";
import { Kiosco } from "./Kiosco";

export const dynamic = "force-dynamic";

// Es la pantalla del celular fijo de un local: que no aparezca en los buscadores.
export const metadata: Metadata = {
  title: "Registro de asistencia",
  robots: { index: false, follow: false },
};

/**
 * El celular fijo del Registro de asistencia: la pantalla donde el personal marca entrada, almuerzo y salida.
 * No hay usuario ni contraseña: la llave está en la dirección (imposible de adivinar) y el dueño la saca del
 * panel, en Registro de asistencia. Si la regenera o la apaga, esta dirección deja de andar.
 *
 * Solo trae la lista de personas ACTIVAS de ese local (nombre, cargo y su foto de alta): nunca el PIN ni datos
 * de otro negocio.
 */
export default async function AsistenciaKioscoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const local = await localPorToken(token);
  if (!local) notFound();

  const colaboradores = await prisma.colaborador.findMany({
    where: { storeId: local.id, activo: true },
    orderBy: [{ nombre: "asc" }, { createdAt: "asc" }],
    select: { id: true, nombre: true, apellido: true, cargo: true, fotoUrl: true },
  });

  return (
    <div className="min-h-screen bg-papel-suave">
      <Kiosco token={token} nombreNegocio={local.nombre} colaboradores={colaboradores} />
    </div>
  );
}
