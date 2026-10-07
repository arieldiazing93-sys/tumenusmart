-- Precios de promoción: el precio de un producto que vale solo en ciertos días y horas de la semana (ej: de lunes a viernes de 18 a 20 horas,
-- 27.000 en vez de 30.000) y que vuelve solo al precio normal cuando pasa la franja. Una fila por promoción; como máximo una por día de inicio
-- en cada producto. Días: 0 = domingo ... 6 = sábado. Horas "HH:MM:SS", en hora de Asunción.
-- Todo con IF NOT EXISTS / DROP IF EXISTS: se puede correr de nuevo sin romper nada.

CREATE TABLE IF NOT EXISTS "PrecioPromocion" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "diaInicio" INTEGER NOT NULL,
  "horaInicio" TEXT NOT NULL,
  "diaFin" INTEGER NOT NULL,
  "horaFin" TEXT NOT NULL,
  "precio" DECIMAL(10,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PrecioPromocion_pkey" PRIMARY KEY ("id")
);

-- Una sola promoción por producto y día de inicio.
CREATE UNIQUE INDEX IF NOT EXISTS "PrecioPromocion_productId_diaInicio_key" ON "PrecioPromocion"("productId", "diaInicio");
CREATE INDEX IF NOT EXISTS "PrecioPromocion_storeId_idx" ON "PrecioPromocion"("storeId");

ALTER TABLE "PrecioPromocion" DROP CONSTRAINT IF EXISTS "PrecioPromocion_storeId_fkey";
ALTER TABLE "PrecioPromocion" ADD CONSTRAINT "PrecioPromocion_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PrecioPromocion" DROP CONSTRAINT IF EXISTS "PrecioPromocion_productId_fkey";
ALTER TABLE "PrecioPromocion" ADD CONSTRAINT "PrecioPromocion_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Red de seguridad: aunque algo escribiera mal desde afuera, la base no acepta un día que no existe, una hora mal escrita ni un precio sin sentido.
ALTER TABLE "PrecioPromocion" DROP CONSTRAINT IF EXISTS "PrecioPromocion_valores_check";
ALTER TABLE "PrecioPromocion" ADD CONSTRAINT "PrecioPromocion_valores_check" CHECK (
  "diaInicio" BETWEEN 0 AND 6
  AND "diaFin" BETWEEN 0 AND 6
  AND "horaInicio" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$'
  AND "horaFin" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$'
  AND "precio" > 0
);
