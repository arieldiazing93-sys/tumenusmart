-- CreateTable
CREATE TABLE "PagoCompra" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "compraId" TEXT NOT NULL,
    "monto" DECIMAL(10,2) NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "formaPago" TEXT NOT NULL DEFAULT 'efectivo',
    "notas" TEXT,
    "registradoPor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PagoCompra_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PagoCompra_storeId_idx" ON "PagoCompra"("storeId");
CREATE INDEX "PagoCompra_compraId_idx" ON "PagoCompra"("compraId");

-- AddForeignKey
ALTER TABLE "PagoCompra" ADD CONSTRAINT "PagoCompra_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PagoCompra" ADD CONSTRAINT "PagoCompra_compraId_fkey" FOREIGN KEY ("compraId") REFERENCES "Compra"("id") ON DELETE CASCADE ON UPDATE CASCADE;
