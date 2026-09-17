-- AlterTable
ALTER TABLE "Store" ADD COLUMN "contadorVentasPos" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "TurnoPos" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'abierto',
    "montoInicial" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "abiertoPor" TEXT NOT NULL,
    "abiertoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cantidadVentas" INTEGER,
    "calculadoEfectivo" DECIMAL(10,2),
    "calculadoTransferencia" DECIMAL(10,2),
    "calculadoTarjetaDebito" DECIMAL(10,2),
    "calculadoTarjetaCredito" DECIMAL(10,2),
    "declaradoEfectivo" DECIMAL(10,2),
    "declaradoTransferencia" DECIMAL(10,2),
    "declaradoTarjetaDebito" DECIMAL(10,2),
    "declaradoTarjetaCredito" DECIMAL(10,2),
    "notas" TEXT,
    "cerradoPor" TEXT,
    "cerradoEn" TIMESTAMP(3),

    CONSTRAINT "TurnoPos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VentaPos" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "turnoPosId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "formaPago" TEXT NOT NULL,
    "total" DECIMAL(10,2) NOT NULL,
    "registradoPor" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VentaPos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VentaPosItem" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "ventaPosId" TEXT NOT NULL,
    "productId" TEXT,
    "nombreProducto" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "precioUnitario" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "VentaPosItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TurnoPos_storeId_idx" ON "TurnoPos"("storeId");

-- CreateIndex
CREATE INDEX "TurnoPos_storeId_estado_idx" ON "TurnoPos"("storeId", "estado");

-- CreateIndex
-- Defensa extra ante una carrera real (dos "abrir turno" en el mismo
-- instante): Prisma no puede expresar un índice único parcial en el schema,
-- así que este queda como DDL no administrado por Prisma — no pasa nada
-- porque este proyecto nunca corre `prisma migrate dev`/`db pull`.
CREATE UNIQUE INDEX "TurnoPos_un_abierto_por_local" ON "TurnoPos"("storeId") WHERE "estado" = 'abierto';

-- CreateIndex
CREATE INDEX "VentaPos_storeId_idx" ON "VentaPos"("storeId");

-- CreateIndex
CREATE INDEX "VentaPos_turnoPosId_idx" ON "VentaPos"("turnoPosId");

-- CreateIndex
CREATE INDEX "VentaPos_storeId_creadoEn_idx" ON "VentaPos"("storeId", "creadoEn");

-- CreateIndex
CREATE INDEX "VentaPosItem_storeId_idx" ON "VentaPosItem"("storeId");

-- CreateIndex
CREATE INDEX "VentaPosItem_ventaPosId_idx" ON "VentaPosItem"("ventaPosId");

-- AddForeignKey
ALTER TABLE "TurnoPos" ADD CONSTRAINT "TurnoPos_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VentaPos" ADD CONSTRAINT "VentaPos_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VentaPos" ADD CONSTRAINT "VentaPos_turnoPosId_fkey" FOREIGN KEY ("turnoPosId") REFERENCES "TurnoPos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VentaPosItem" ADD CONSTRAINT "VentaPosItem_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VentaPosItem" ADD CONSTRAINT "VentaPosItem_ventaPosId_fkey" FOREIGN KEY ("ventaPosId") REFERENCES "VentaPos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VentaPosItem" ADD CONSTRAINT "VentaPosItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
