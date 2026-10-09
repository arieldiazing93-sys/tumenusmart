-- Eventos de la facturación electrónica ante la DNIT: la CANCELACIÓN de un documento ya aprobado y la INUTILIZACIÓN de números
-- que no se usaron. Se crean "pendientes" y la tarea programada los firma y los envía. Se puede correr de nuevo sin romper nada.

CREATE TABLE IF NOT EXISTS "EventoElectronico" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "tipo" TEXT NOT NULL,
  "documentoId" TEXT,
  "cdc" TEXT,
  "timbrado" TEXT,
  "establecimiento" TEXT,
  "punto" TEXT,
  "numeroDesde" INTEGER,
  "numeroHasta" INTEGER,
  "tipoDocumento" INTEGER,
  "motivo" TEXT NOT NULL,
  "estado" TEXT NOT NULL DEFAULT 'pendiente',
  "idEvento" TEXT,
  "xmlFirmado" TEXT,
  "enviadoEn" TIMESTAMP(3),
  "procesadoEn" TIMESTAMP(3),
  "protocoloAutorizacion" TEXT,
  "respuestaCodigo" TEXT,
  "respuestaMensaje" TEXT,
  "errorEnvio" TEXT,
  "intentos" INTEGER NOT NULL DEFAULT 0,
  "proximoIntentoEn" TIMESTAMP(3),
  "creadoPor" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EventoElectronico_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "EventoElectronico_storeId_estado_idx" ON "EventoElectronico"("storeId", "estado");
CREATE INDEX IF NOT EXISTS "EventoElectronico_estado_proximoIntentoEn_idx" ON "EventoElectronico"("estado", "proximoIntentoEn");
CREATE INDEX IF NOT EXISTS "EventoElectronico_documentoId_idx" ON "EventoElectronico"("documentoId");
ALTER TABLE "EventoElectronico" DROP CONSTRAINT IF EXISTS "EventoElectronico_storeId_fkey";
ALTER TABLE "EventoElectronico" ADD CONSTRAINT "EventoElectronico_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventoElectronico" DROP CONSTRAINT IF EXISTS "EventoElectronico_documentoId_fkey";
ALTER TABLE "EventoElectronico" ADD CONSTRAINT "EventoElectronico_documentoId_fkey"
  FOREIGN KEY ("documentoId") REFERENCES "DocumentoElectronico"("id") ON DELETE SET NULL ON UPDATE CASCADE;
