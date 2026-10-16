-- Códigos de barras: cada producto puede tener UN código (el de fábrica, que se escanea, o uno propio que genera el sistema) y con él el punto de
-- venta suma el producto al escanearlo. No se repite dentro de un mismo local; los productos sin código quedan en NULL (la base permite varios NULL
-- en un índice único). El contador lleva la cuenta de los códigos propios generados. Se puede correr de nuevo sin romper nada.

ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "codigoBarras" TEXT;
ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "contadorCodigosInternos" INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS "Product_storeId_codigoBarras_key" ON "Product"("storeId", "codigoBarras");
