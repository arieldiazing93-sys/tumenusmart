import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { localPorToken } from "@/lib/asistencia-servidor";
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
 * panel, en Asistencia → Celular fijo. Si la regenera o la apaga, esta dirección deja de andar.
 *
 * No trae ninguna lista de personas: cada una se identifica con su PIN, así que acá no hay nada que ver de nadie,
 * ni siquiera con la dirección en la mano. Solo el nombre del negocio.
 */
export default async function AsistenciaKioscoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const local = await localPorToken(token);
  if (!local) notFound();

  return (
    <div className="min-h-screen bg-papel-suave">
      <Kiosco token={token} nombreNegocio={local.nombre} />
    </div>
  );
}
