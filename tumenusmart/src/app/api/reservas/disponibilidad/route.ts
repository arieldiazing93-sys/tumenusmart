import { NextRequest, NextResponse } from "next/server";
import { calcularDisponibilidad } from "@/lib/cupos-reserva";

export const dynamic = "force-dynamic";

/**
 * Cuántos lugares quedan en cada horario para una fecha dada.
 *
 * Es pública a propósito: es exactamente la información que cualquier
 * pantalla de reservas muestra. No devuelve ningún dato de los clientes,
 * solo el conteo de personas por horario.
 */
export async function GET(request: NextRequest) {
  const fecha = request.nextUrl.searchParams.get("fecha") ?? "";

  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return NextResponse.json({ error: "Fecha inválida" }, { status: 400 });
  }

  const disponibilidad = await calcularDisponibilidad(fecha);

  return NextResponse.json(
    { fecha, disponibilidad },
    { headers: { "Cache-Control": "no-store" } }
  );
}
