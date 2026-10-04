import { NextResponse } from "next/server";
import { sesionActual } from "@/lib/auth";
import { puede } from "@/lib/permisos";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { estacionActual } from "@/lib/estacion-actual";
import { REINTENTOS_MAXIMOS } from "@/lib/comedor";

export const dynamic = "force-dynamic";

/**
 * La estación cuenta cómo le fue con un trabajo que había reclamado: salió (`ok: true`) o falló (`ok: false`, con el
 * motivo). Un trabajo que falla vuelve a la fila para reintentarse, hasta el tope de intentos; pasado el tope queda con
 * error para que se vea en la lista y se pueda reimprimir a mano.
 *
 * Solo se puede marcar un trabajo que ESTA estación reclamó y que sigue "imprimiendo": ninguna otra computadora ni una
 * llamada armada a mano puede dar por impreso (o por fallado) lo de otra. Sesión y permiso se validan acá, antes de
 * tocar la base.
 */
export async function POST(request: Request) {
  const sesion = await sesionActual();
  if (!sesion) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!puede(sesion.rol, "comedor.gestionar")) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });

  const cuerpo: unknown = await request.json().catch(() => null);
  const datos = (cuerpo && typeof cuerpo === "object" ? cuerpo : {}) as Record<string, unknown>;
  const id = typeof datos.id === "string" ? datos.id : "";
  const salio = datos.ok === true;
  // La estación lo da por cerrado SIN imprimir porque tiene 0 copias para esa área (una decisión del local, no un error).
  const omitido = datos.omitido === true;
  const motivo = typeof datos.error === "string" ? datos.error.slice(0, 300) : null;
  if (!id) return NextResponse.json({ error: "Falta el trabajo" }, { status: 400 });

  // Todas las consultas de acá abajo quedan atadas a este local.
  const db = prismaDelLocal(await idLocalActual());
  const estacion = await estacionActual(db);
  if (!estacion) return NextResponse.json({ ok: false, motivo: "sin_estacion" }, { status: 409 });

  const trabajo = await db.trabajoImpresion.findFirst({
    where: { id, estacionId: estacion.id, estado: "imprimiendo" },
    select: { id: true, intentos: true },
  });
  if (!trabajo) return NextResponse.json({ ok: false, motivo: "no_reclamado" }, { status: 409 });

  await db.trabajoImpresion.updateMany({
    where: { id: trabajo.id, estacionId: estacion.id, estado: "imprimiendo" },
    data: omitido
      ? { estado: "omitido", impresoEn: new Date(), error: "No se imprimió: esta estación tiene 0 copias para esta área." }
      : salio
        ? { estado: "impreso", impresoEn: new Date(), error: null }
        : { estado: trabajo.intentos >= REINTENTOS_MAXIMOS ? "error" : "pendiente", error: motivo ?? "No se pudo imprimir." },
  });

  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
