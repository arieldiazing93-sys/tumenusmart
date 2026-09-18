ALTER TABLE "Store" ADD COLUMN "contadorClientes" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Customer" ADD COLUMN "numero" INTEGER;
ALTER TABLE "Customer" ADD COLUMN "email" TEXT;

CREATE UNIQUE INDEX "Customer_storeId_numero_key" ON "Customer"("storeId", "numero");
