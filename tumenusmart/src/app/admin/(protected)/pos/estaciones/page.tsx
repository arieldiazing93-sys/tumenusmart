import { pantallaConPermiso } from "@/lib/auth";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { estacionActual } from "@/lib/estacion-actual";
import { Cabecera } from "@/components/ui";
import { CrearEstacionForm } from "./CrearEstacionForm";
import { EstacionFila } from "./EstacionFila";

export const dynamic = "force-dynamic";

export default async function EstacionesPage() {
  await pantallaConPermiso("pos.gestionarEstaciones");
  const prisma = prismaDelLocal(await idLocalActual());

  const [estaciones, vinculada, puntosExpedicion, areasImpresion] = await Promise.all([
    prisma.estacion.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        _count: { select: { turnos: true } },
        impresoras: { select: { areaImpresionId: true, nombreImpresora: true } },
      },
    }),
    estacionActual(prisma),
    prisma.puntoExpedicion.findMany({
      where: { activo: true },
      orderBy: { nombre: "asc" },
      select: { id: true, nombre: true, establecimiento: true, puntoExpedicion: true },
    }),
    prisma.areaImpresion.findMany({
      where: { activa: true },
      orderBy: [{ orden: "asc" }, { createdAt: "asc" }],
      select: { id: true, nombre: true },
    }),
  ]);

  return (
    <div>
      <Cabecera
        titulo="Estaciones"
        bajada="Cada notebook/caja física del local. Un turno de Punto de Venta abierto en una estación no interrumpe el de otra."
      />

      <div className="mb-6 max-w-lg rounded-lg border border-linea bg-papel-suave px-4 py-3 text-[0.85rem] text-tinta-media">
        Para que un cajero nunca tenga que elegir dónde está trabajando, cada
        computadora se vincula UNA SOLA VEZ a su estación — desde ESTA
        pantalla, físicamente en esa notebook. Si se cambia de computadora o
        se borran los datos del navegador, hay que volver a vincular acá.
      </div>

      <CrearEstacionForm />

      <div className="flex flex-col gap-2">
        {estaciones.map((e) => (
          <EstacionFila
            key={e.id}
            id={e.id}
            nombre={e.nombre}
            activa={e.activa}
            cantidadTurnos={e._count.turnos}
            esEstaComputadora={vinculada?.id === e.id}
            puntoExpedicionId={e.puntoExpedicionId}
            puntosExpedicion={puntosExpedicion}
            areaTicketId={e.areaTicketId}
            impresoras={e.impresoras}
            areasImpresion={areasImpresion}
          />
        ))}
        {estaciones.length === 0 && (
          <p className="text-sm text-tinta-suave">Todavía no hay estaciones creadas.</p>
        )}
      </div>
    </div>
  );
}
