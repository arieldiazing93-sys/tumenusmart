-- CreateTable
CREATE TABLE "Almacen" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Almacen_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Almacen_storeId_idx" ON "Almacen"("storeId");

-- AddForeignKey
ALTER TABLE "Almacen" ADD CONSTRAINT "Almacen_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable Compra
ALTER TABLE "Compra" ADD COLUMN "condicionPago" TEXT NOT NULL DEFAULT 'contado';
ALTER TABLE "Compra" ADD COLUMN "fechaVencimiento" TIMESTAMP(3);
ALTER TABLE "Compra" ADD COLUMN "descuentoGeneralPorcentaje" DECIMAL(5,2);
ALTER TABLE "Compra" ADD COLUMN "cancelada" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Compra" ADD COLUMN "canceladaPor" TEXT;
ALTER TABLE "Compra" ADD COLUMN "canceladaEn" TIMESTAMP(3);
ALTER TABLE "Compra" ADD COLUMN "motivoCancelacion" TEXT;

-- AlterTable CompraItem
ALTER TABLE "CompraItem" ADD COLUMN "almacenId" TEXT;
ALTER TABLE "CompraItem" ADD COLUMN "descuentoPorcentaje" DECIMAL(5,2);

-- CreateIndex
CREATE INDEX "CompraItem_almacenId_idx" ON "CompraItem"("almacenId");

-- AddForeignKey
ALTER TABLE "CompraItem" ADD CONSTRAINT "CompraItem_almacenId_fkey" FOREIGN KEY ("almacenId") REFERENCES "Almacen"("id") ON DELETE SET NULL ON UPDATE CASCADE;
