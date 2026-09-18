-- Fase 9: Áreas de Impresión (Cocina, Barra, Caja...) + mapeo por Estación
-- a impresoras QZ Tray reales, para la impresión automática de comandas y
-- tickets/facturas.

CREATE TABLE "AreaImpresion" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AreaImpresion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AreaImpresion_storeId_idx" ON "AreaImpresion"("storeId");

ALTER TABLE "AreaImpresion" ADD CONSTRAINT "AreaImpresion_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Producto: a qué área se manda en la comanda automática (null = no imprime).
ALTER TABLE "Product" ADD COLUMN "areaImpresionId" TEXT;

ALTER TABLE "Product" ADD CONSTRAINT "Product_areaImpresionId_fkey"
    FOREIGN KEY ("areaImpresionId") REFERENCES "AreaImpresion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Estación: qué área maneja el ticket/factura EN ESTA estación.
ALTER TABLE "Estacion" ADD COLUMN "areaTicketId" TEXT;

ALTER TABLE "Estacion" ADD CONSTRAINT "Estacion_areaTicketId_fkey"
    FOREIGN KEY ("areaTicketId") REFERENCES "AreaImpresion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Mapeo por Estación: qué impresora real (nombre tal cual lo reporta QZ
-- Tray en esa notebook) maneja cada Área de Impresión.
CREATE TABLE "EstacionImpresora" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "estacionId" TEXT NOT NULL,
    "areaImpresionId" TEXT NOT NULL,
    "nombreImpresora" TEXT NOT NULL,

    CONSTRAINT "EstacionImpresora_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EstacionImpresora_estacionId_areaImpresionId_key"
    ON "EstacionImpresora"("estacionId", "areaImpresionId");

CREATE INDEX "EstacionImpresora_storeId_idx" ON "EstacionImpresora"("storeId");
CREATE INDEX "EstacionImpresora_estacionId_idx" ON "EstacionImpresora"("estacionId");

ALTER TABLE "EstacionImpresora" ADD CONSTRAINT "EstacionImpresora_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EstacionImpresora" ADD CONSTRAINT "EstacionImpresora_estacionId_fkey"
    FOREIGN KEY ("estacionId") REFERENCES "Estacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EstacionImpresora" ADD CONSTRAINT "EstacionImpresora_areaImpresionId_fkey"
    FOREIGN KEY ("areaImpresionId") REFERENCES "AreaImpresion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
