-- AlterTable
ALTER TABLE "Store" ADD COLUMN "contadorCotizaciones" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Cotizacion" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validezDias" INTEGER NOT NULL DEFAULT 15,
    "clienteNombre" TEXT NOT NULL,
    "clienteIdentificacion" TEXT,
    "clienteTelefono" TEXT,
    "clienteEmail" TEXT,
    "notas" TEXT,
    "descuento" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "descuentoPorcentaje" DECIMAL(5,2),
    "total" DECIMAL(14,2) NOT NULL,
    "creadaPor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cotizacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CotizacionItem" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "cotizacionId" TEXT NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "cantidad" DECIMAL(10,2) NOT NULL,
    "precioUnitario" DECIMAL(14,2) NOT NULL,
    "iva" TEXT NOT NULL DEFAULT 'gravado10',

    CONSTRAINT "CotizacionItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Cotizacion_storeId_numero_key" ON "Cotizacion"("storeId", "numero");
CREATE INDEX "Cotizacion_storeId_idx" ON "Cotizacion"("storeId");
CREATE INDEX "CotizacionItem_storeId_idx" ON "CotizacionItem"("storeId");
CREATE INDEX "CotizacionItem_cotizacionId_idx" ON "CotizacionItem"("cotizacionId");

-- AddForeignKey
ALTER TABLE "Cotizacion" ADD CONSTRAINT "Cotizacion_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CotizacionItem" ADD CONSTRAINT "CotizacionItem_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CotizacionItem" ADD CONSTRAINT "CotizacionItem_cotizacionId_fkey" FOREIGN KEY ("cotizacionId") REFERENCES "Cotizacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
