import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calcularDisponibilidad } from "@/lib/cupos-reserva";

export const dynamic = "force-dynamic";

/**
 * Cuántos lugares quedan en cada horario de un local, para una fecha dada.
 *
 * Es pública a propósito: es exactamente la información que cualquier
 * pantalla de reservas muestra. No devuelve ningún dato de los clientes,
 * solo el conteo de personas por horario del local que se pide.
 */
export async function GET(request: NextRequest) {
  const slug = (request.nextUrl.searchParams.get("local") ?? "").toLowerCase();
  const fecha = request.nextUrl.searchParams.get("fecha") ?? "";

  if (!slug) {
    return NextResponse.json({ error: "Falta el local" }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return NextResponse.json({ error: "Fecha inválida" }, { status: 400 });
  }

  // El local se resuelve acá: el navegador manda un nombre, no un
  // identificador interno que podamos usar sin verificar.
  const local = await prisma.store.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!local) {
    return NextResponse.json({ error: "Local inexistente" }, { status: 404 });
  }

  const disponibilidad = await calcularDisponibilidad(local.id, fecha);

  return NextResponse.json(
    { fecha, disponibilidad },
    { headers: { "Cache-Control": "no-store" } }
  );
}
