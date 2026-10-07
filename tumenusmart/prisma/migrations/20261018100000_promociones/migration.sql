-- Promociones: por DESCUENTO ("PROMO 20 %") o por VOLUMEN ("2 por 1": por cada 2, regalar 1), que rigen en ciertos días y horas para un grupo de
-- productos. Una tabla para la promoción, una para sus días y horarios y una para sus productos. Días: 0 = domingo ... 6 = sábado; horas
-- "HH:MM:SS", en hora de Asunción. Además, los productos de las cuentas del comedor y del delivery anotan qué promoción se les aplicó y si son
-- cortesía (para sumar lo pedido en varios pedidos de una misma cuenta y recortar las cortesías si después se cancelan productos).
-- Todo con IF NOT EXISTS / DROP IF EXISTS: se puede correr de nuevo sin romper nada.

CREATE TABLE IF NOT EXISTS "Promocion" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "nombre" TEXT NOT NULL,
  "tipo" TEXT NOT NULL,
  "activa" BOOLEAN NOT NULL DEFAULT true,
  "porcentaje" DECIMAL(5,2),
  "porCada" INTEGER,
  "regalar" INTEGER,
  "forzarPorProducto" BOOLEAN NOT NULL DEFAULT false,
  "aplicaAModificadores" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Promocion_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Promocion_storeId_idx" ON "Promocion"("storeId");
ALTER TABLE "Promocion" DROP CONSTRAINT IF EXISTS "Promocion_storeId_fkey";
ALTER TABLE "Promocion" ADD CONSTRAINT "Promocion_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- Red de seguridad: la base no acepta un tipo que no existe, un descuento fuera de 0-100 ni un "por cada / regalar" sin sentido.
ALTER TABLE "Promocion" DROP CONSTRAINT IF EXISTS "Promocion_valores_check";
ALTER TABLE "Promocion" ADD CONSTRAINT "Promocion_valores_check" CHECK (
  ("tipo" = 'descuento' AND "porcentaje" IS NOT NULL AND "porcentaje" > 0 AND "porcentaje" < 100)
  OR ("tipo" = 'volumen' AND "porCada" IS NOT NULL AND "regalar" IS NOT NULL AND "porCada" >= 2 AND "regalar" >= 1 AND "regalar" < "porCada")
);

CREATE TABLE IF NOT EXISTS "PromocionDia" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "promocionId" TEXT NOT NULL,
  "diaInicio" INTEGER NOT NULL,
  "horaInicio" TEXT NOT NULL,
  "diaFin" INTEGER NOT NULL,
  "horaFin" TEXT NOT NULL,
  CONSTRAINT "PromocionDia_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PromocionDia_promocionId_diaInicio_key" ON "PromocionDia"("promocionId", "diaInicio");
CREATE INDEX IF NOT EXISTS "PromocionDia_storeId_idx" ON "PromocionDia"("storeId");
ALTER TABLE "PromocionDia" DROP CONSTRAINT IF EXISTS "PromocionDia_storeId_fkey";
ALTER TABLE "PromocionDia" ADD CONSTRAINT "PromocionDia_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PromocionDia" DROP CONSTRAINT IF EXISTS "PromocionDia_promocionId_fkey";
ALTER TABLE "PromocionDia" ADD CONSTRAINT "PromocionDia_promocionId_fkey"
  FOREIGN KEY ("promocionId") REFERENCES "Promocion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PromocionDia" DROP CONSTRAINT IF EXISTS "PromocionDia_valores_check";
ALTER TABLE "PromocionDia" ADD CONSTRAINT "PromocionDia_valores_check" CHECK (
  "diaInicio" BETWEEN 0 AND 6
  AND "diaFin" BETWEEN 0 AND 6
  AND "horaInicio" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$'
  AND "horaFin" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$'
);

CREATE TABLE IF NOT EXISTS "PromocionProducto" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "promocionId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  CONSTRAINT "PromocionProducto_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PromocionProducto_promocionId_productId_key" ON "PromocionProducto"("promocionId", "productId");
CREATE INDEX IF NOT EXISTS "PromocionProducto_storeId_idx" ON "PromocionProducto"("storeId");
CREATE INDEX IF NOT EXISTS "PromocionProducto_productId_idx" ON "PromocionProducto"("productId");
ALTER TABLE "PromocionProducto" DROP CONSTRAINT IF EXISTS "PromocionProducto_storeId_fkey";
ALTER TABLE "PromocionProducto" ADD CONSTRAINT "PromocionProducto_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PromocionProducto" DROP CONSTRAINT IF EXISTS "PromocionProducto_promocionId_fkey";
ALTER TABLE "PromocionProducto" ADD CONSTRAINT "PromocionProducto_promocionId_fkey"
  FOREIGN KEY ("promocionId") REFERENCES "Promocion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PromocionProducto" DROP CONSTRAINT IF EXISTS "PromocionProducto_productId_fkey";
ALTER TABLE "PromocionProducto" ADD CONSTRAINT "PromocionProducto_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Los productos de las cuentas del comedor y del delivery: qué promoción se les aplicó y si son la parte regalada.
ALTER TABLE "ItemCuentaMesa" ADD COLUMN IF NOT EXISTS "promocionId" TEXT;
ALTER TABLE "ItemCuentaMesa" ADD COLUMN IF NOT EXISTS "cortesia" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ItemCuentaDelivery" ADD COLUMN IF NOT EXISTS "promocionId" TEXT;
ALTER TABLE "ItemCuentaDelivery" ADD COLUMN IF NOT EXISTS "cortesia" BOOLEAN NOT NULL DEFAULT false;
