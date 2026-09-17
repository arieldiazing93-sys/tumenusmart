-- AlterTable
ALTER TABLE "Order" ADD COLUMN "formaPagoPos" TEXT;
ALTER TABLE "Order" ADD COLUMN "turnoPosId" TEXT;

-- CreateIndex
CREATE INDEX "Order_turnoPosId_idx" ON "Order"("turnoPosId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_turnoPosId_fkey" FOREIGN KEY ("turnoPosId") REFERENCES "TurnoPos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
