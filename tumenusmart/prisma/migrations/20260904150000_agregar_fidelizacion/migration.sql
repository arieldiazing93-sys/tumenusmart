-- AlterTable
ALTER TABLE "Store" ADD COLUMN "fidelizacionActiva" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "fidelizacionPremio" TEXT,
ADD COLUMN "fidelizacionUmbral" INTEGER NOT NULL DEFAULT 10;

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN "pedidosCanjeados" INTEGER NOT NULL DEFAULT 0;
