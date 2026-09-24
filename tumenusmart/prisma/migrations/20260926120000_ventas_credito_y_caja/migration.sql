-- AlterTable
ALTER TABLE "Store" ADD COLUMN "ventasACredito" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TurnoPos" ADD COLUMN "movimientosEfectivoNeto" DECIMAL(12,2);
ALTER TABLE "VentaPos" ADD COLUMN "fechaVencimientoCredito" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "CobroVenta" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "ventaPosId" TEXT NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "formaPago" TEXT NOT NULL,
    "notas" TEXT,
    "registradoPor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CobroVenta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimientoCaja" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "turnoPosId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "concepto" TEXT NOT NULL,
    "registradoPor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cobroVentaId" TEXT,

    CONSTRAINT "MovimientoCaja_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CobroVenta_storeId_idx" ON "CobroVenta"("storeId");
CREATE INDEX "CobroVenta_ventaPosId_idx" ON "CobroVenta"("ventaPosId");
CREATE UNIQUE INDEX "MovimientoCaja_cobroVentaId_key" ON "MovimientoCaja"("cobroVentaId");
CREATE INDEX "MovimientoCaja_storeId_idx" ON "MovimientoCaja"("storeId");
CREATE INDEX "MovimientoCaja_turnoPosId_idx" ON "MovimientoCaja"("turnoPosId");

-- AddForeignKey
ALTER TABLE "CobroVenta" ADD CONSTRAINT "CobroVenta_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CobroVenta" ADD CONSTRAINT "CobroVenta_ventaPosId_fkey" FOREIGN KEY ("ventaPosId") REFERENCES "VentaPos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MovimientoCaja" ADD CONSTRAINT "MovimientoCaja_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MovimientoCaja" ADD CONSTRAINT "MovimientoCaja_turnoPosId_fkey" FOREIGN KEY ("turnoPosId") REFERENCES "TurnoPos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MovimientoCaja" ADD CONSTRAINT "MovimientoCaja_cobroVentaId_fkey" FOREIGN KEY ("cobroVentaId") REFERENCES "CobroVenta"("id") ON DELETE CASCADE ON UPDATE CASCADE;
