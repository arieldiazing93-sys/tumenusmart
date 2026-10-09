import { pantallaConPermiso } from "@/lib/auth";
import { prismaDelLocal } from "@/lib/prisma-local";
import { prisma as prismaGlobal } from "@/lib/prisma";
import { idLocalActual } from "@/lib/local-actual";
import { Cabecera, Vacio } from "@/components/ui";
import { claveDiaAsuncion } from "@/lib/timezone";
import { CrearPuntoExpedicionForm } from "./CrearPuntoExpedicionForm";
import { PuntoExpedicionFila } from "./PuntoExpedicionFila";
import { FacturaObligatoriaToggle } from "./FacturaObligatoriaToggle";
import { EmisorFiscalForm } from "./EmisorFiscalForm";
import { emisorDesdeFila } from "@/lib/emisor-fiscal";
import { completarUbicacionEmisor } from "@/lib/sifen/geografia";
import { normalizarModalidad } from "@/lib/modalidad-punto";

export const dynamic = "force-dynamic";

export default async function PuntosExpedicionPage() {
  await pantallaConPermiso("pos.gestionarEstaciones");
  const idLocal = await idLocalActual();
  const prisma = prismaDelLocal(idLocal);

  const [puntos, store, emisorFila] = await Promise.all([
    prisma.puntoExpedicion.findMany({ orderBy: { createdAt: "asc" } }),
    // Store no pertenece a ningún local, se lee con el cliente global.
    prismaGlobal.store.findUnique({ where: { id: idLocal }, select: { facturaObligatoria: true } }),
    // Los datos del emisor para factura electrónica: uno por local, se busca por su local explícito.
    prismaGlobal.emisorFiscal.findUnique({ where: { storeId: idLocal } }),
  ]);

  // Un local factura con un solo tipo de timbrado: el de sus puntos activos (null si todavía no tiene ninguno).
  const puntoActivo = puntos.find((p) => p.activo);
  const modalidadDelLocal = puntoActivo ? normalizarModalidad(puntoActivo.modalidad) : null;

  return (
    <div>
      <Cabecera
        titulo="Puntos de expedición"
        bajada="Los puntos de expedición que la DNIT autorizó, cada uno con su propio timbrado y numeración: autoimpresor o electrónico (SIFEN). Un local usa un solo tipo. Se asignan a las estaciones en Estaciones."
      />

      <FacturaObligatoriaToggle obligatoria={store?.facturaObligatoria ?? false} />

      <CrearPuntoExpedicionForm modalidadDelLocal={modalidadDelLocal} />

      <EmisorFiscalForm inicial={completarUbicacionEmisor(emisorDesdeFila(emisorFila))} />

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
            modalidad={p.modalidad}
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
