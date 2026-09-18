import { NextResponse } from "next/server";
import { sesionActual } from "@/lib/auth";
import { certificadoQz } from "@/lib/qz-firma";

export const dynamic = "force-dynamic";

/**
 * Sirve el certificado público que QZ Tray usa para confiar en este sitio
 * sin mostrar el diálogo de "¿confiar?" en cada impresión. No es secreto,
 * pero igual exige sesión — no hay motivo para que sea alcanzable sin
 * loguearse.
 */
export async function GET() {
  const sesion = await sesionActual();
  if (!sesion) return new NextResponse("No autorizado", { status: 401 });

  try {
    return new NextResponse(certificadoQz(), {
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  } catch {
    return new NextResponse("Impresión silenciosa no configurada", { status: 500 });
  }
}
