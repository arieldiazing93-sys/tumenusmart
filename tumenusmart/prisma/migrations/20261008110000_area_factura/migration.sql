-- Impresion: el area de la FACTURA se asigna aparte de la del ticket (cada una con su impresora, sus copias y su prueba).
-- Null = la misma que el ticket, como funcionaba hasta ahora. Con IF NOT EXISTS / DROP IF EXISTS: se puede correr de nuevo.

ALTER TABLE "Estacion" ADD COLUMN IF NOT EXISTS "areaFacturaId" TEXT;
ALTER TABLE "Estacion" DROP CONSTRAINT IF EXISTS "Estacion_areaFacturaId_fkey";
ALTER TABLE "Estacion" ADD CONSTRAINT "Estacion_areaFacturaId_fkey"
  FOREIGN KEY ("areaFacturaId") REFERENCES "AreaImpresion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
