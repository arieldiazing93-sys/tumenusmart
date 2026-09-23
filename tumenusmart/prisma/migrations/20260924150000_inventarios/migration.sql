-- CreateTable
CREATE TABLE "Inventario" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "almacenId" TEXT,
    "almacenNombre" TEXT NOT NULL,
    "categorias" TEXT NOT NULL,
    "contados" INTEGER NOT NULL,
    "conDiferencia" INTEGER NOT NULL,
    "valorSistema" DECIMAL(14,2) NOT NULL,
    "valorContado" DECIMAL(14,2) NOT NULL,
    "registradoPor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Inventario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventarioItem" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "inventarioId" TEXT NOT NULL,
    "insumoId" TEXT,
    "insumoNombre" TEXT NOT NULL,
    "categoriaNombre" TEXT,
    "unidad" TEXT NOT NULL,
    "stockSistema" DECIMAL(12,3) NOT NULL,
    "contado" DECIMAL(12,3),
    "diferencia" DECIMAL(12,3),
    "costoUnitario" DECIMAL(10,2),
    "orden" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "InventarioItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Inventario_storeId_createdAt_idx" ON "Inventario"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "InventarioItem_storeId_idx" ON "InventarioItem"("storeId");

-- CreateIndex
CREATE INDEX "InventarioItem_inventarioId_idx" ON "InventarioItem"("inventarioId");

-- AddForeignKey
ALTER TABLE "Inventario" ADD CONSTRAINT "Inventario_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inventario" ADD CONSTRAINT "Inventario_almacenId_fkey" FOREIGN KEY ("almacenId") REFERENCES "Almacen"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventarioItem" ADD CONSTRAINT "InventarioItem_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventarioItem" ADD CONSTRAINT "InventarioItem_inventarioId_fkey" FOREIGN KEY ("inventarioId") REFERENCES "Inventario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventarioItem" ADD CONSTRAINT "InventarioItem_insumoId_fkey" FOREIGN KEY ("insumoId") REFERENCES "Insumo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
