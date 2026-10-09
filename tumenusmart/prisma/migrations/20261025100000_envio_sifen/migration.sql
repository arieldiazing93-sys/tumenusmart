-- Envío de las facturas electrónicas a la DNIT: el número de transacción con que la aprobó, cuándo la procesó y el último problema
-- de comunicación (para reintentar solo). Se puede correr de nuevo sin romper nada.

ALTER TABLE "DocumentoElectronico" ADD COLUMN IF NOT EXISTS "protocoloAutorizacion" TEXT;
ALTER TABLE "DocumentoElectronico" ADD COLUMN IF NOT EXISTS "procesadoEn" TIMESTAMP(3);
ALTER TABLE "DocumentoElectronico" ADD COLUMN IF NOT EXISTS "errorEnvio" TEXT;

-- Para encontrar rápido lo que está por enviar.
CREATE INDEX IF NOT EXISTS "DocumentoElectronico_estado_proximoIntentoEn_idx" ON "DocumentoElectronico"("estado", "proximoIntentoEn");
