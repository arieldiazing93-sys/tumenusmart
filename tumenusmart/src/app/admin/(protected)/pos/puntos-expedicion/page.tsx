import { pantallaConPermiso } from "@/lib/auth";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { Cabecera, Vacio } from "@/components/ui";
import { claveDiaAsuncion } from "@/lib/timezone";
import { CrearPuntoExpedicionForm } from "./CrearPuntoExpedicionForm";
import { PuntoExpedicionFila } from "./PuntoExpedicionFila";

export const dynamic = "force-dynamic";

export default async function PuntosExpedicionPage() {
  await pantallaConPermiso("pos.gestionarEstaciones");
  const prisma = prismaDelLocal(await idLocalActual());

  const puntos = await prisma.puntoExpedicion.findMany({
    orderBy: { createdAt: "asc" },
  });

  return (
    <div>
      <Cabecera
        titulo="Puntos de expedición"
        bajada="Los puntos de expedición que la DNIT autorizó para Factura Autoimpresor — cada uno con su propio timbrado y numeración. Se asignan a las estaciones en Estaciones."
      />

      <CrearPuntoExpedicionForm />

      <div className="flex flex-col gap-2">
        {puntos.map((p) => (
          <PuntoExpedicionFila
            key={p.id}
            id={p.id}
            nombre={p.nombre}
            establecimiento={p.establecimiento}
            puntoExpedicion={p.puntoExpedicion}
            numeroTimbrado={p.numeroTimbrado}
            timbradoDesde={claveDiaAsuncion(p.timbradoDesde)}
            timbradoHasta={claveDiaAsuncion(p.timbradoHasta)}
            razonSocialEmisor={p.razonSocialEmisor}
            rucEmisor={p.rucEmisor}
            ultimoNumeroFactura={p.ultimoNumeroFactura}
            activo={p.activo}
          />
        ))}
        {puntos.length === 0 && (
          <Vacio
            titulo="Todavía no hay puntos de expedición"
            detalle="Cargá acá arriba el o los puntos de expedición que te autorizó la DNIT."
          />
        )}
      </div>
    </div>
  );
}
