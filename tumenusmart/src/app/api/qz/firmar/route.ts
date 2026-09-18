import { NextRequest, NextResponse } from "next/server";
import { sesionActual } from "@/lib/auth";
import { firmarParaQz } from "@/lib/qz-firma";

export const dynamic = "force-dynamic";

/**
 * Firma el mensaje que QZ Tray manda a validar antes de imprimir. Sin esto
 * QZ igual imprime, pero con un diálogo de confirmación en cada trabajo —
 * justo lo que se quiere evitar. Exige sesión: quien pueda pedir firmas
 * puede hacer que este sitio imprima sin diálogo en la impresora de la
 * estación, así que no puede ser público.
 */
export async function POST(request: NextRequest) {
  const sesion = await sesionActual();
  if (!sesion) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { mensaje } = await request.json().catch(() => ({ mensaje: "" }));
  if (typeof mensaje !== "string" || !mensaje) {
    return NextResponse.json({ error: "Falta el mensaje a firmar" }, { status: 400 });
  }

  try {
    return NextResponse.json({ firma: firmarParaQz(mensaje) });
  } catch (err) {
    // Sin este log, un 500 acá es una caja negra — no se sabe si falta la
    // variable de entorno o si la clave tiene un formato que Node rechaza.
    console.error("Fallo al firmar para QZ Tray:", err);
    return NextResponse.json({ error: "Impresión silenciosa no configurada" }, { status: 500 });
  }
}
