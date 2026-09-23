-- AlterTable MovimientoStock: en qué almacén entra o de cuál sale cada movimiento
ALTER TABLE "MovimientoStock" ADD COLUMN "almacenId" TEXT;

-- CreateIndex
CREATE INDEX "MovimientoStock_almacenId_idx" ON "MovimientoStock"("almacenId");

-- AddForeignKey
ALTER TABLE "MovimientoStock" ADD CONSTRAINT "MovimientoStock_almacenId_fkey" FOREIGN KEY ("almacenId") REFERENCES "Almacen"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable Product: de qué almacén descuenta la receta al vender
ALTER TABLE "Product" ADD COLUMN "almacenId" TEXT;

-- CreateIndex
CREATE INDEX "Product_almacenId_idx" ON "Product"("almacenId");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_almacenId_fkey" FOREIGN KEY ("almacenId") REFERENCES "Almacen"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Movimientos que ya existen: los de compra toman el almacén de su línea de compra...
UPDATE "MovimientoStock" m
SET "almacenId" = (
  SELECT ci."almacenId"
  FROM "CompraItem" ci
  WHERE ci."compraId" = m."compraId" AND ci."insumoId" = m."insumoId" AND ci."almacenId" IS NOT NULL
  ORDER BY ci."id"
  LIMIT 1
)
WHERE m."compraId" IS NOT NULL AND m."almacenId" IS NULL;

-- ...y todo lo demás (ventas, ajustes) queda en el almacén más antiguo del local, si tiene alguno.
UPDATE "MovimientoStock" m
SET "almacenId" = (
  SELECT a."id"
  FROM "Almacen" a
  WHERE a."storeId" = m."storeId"
  ORDER BY a."createdAt" ASC, a."id" ASC
  LIMIT 1
)
WHERE m."almacenId" IS NULL;
