CREATE TABLE "PuntoExpedicion" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "establecimiento" TEXT NOT NULL,
    "puntoExpedicion" TEXT NOT NULL,
    "numeroTimbrado" TEXT NOT NULL,
    "timbradoDesde" TIMESTAMP(3) NOT NULL,
    "timbradoHasta" TIMESTAMP(3) NOT NULL,
    "razonSocialEmisor" TEXT NOT NULL,
    "rucEmisor" TEXT NOT NULL,
    "ultimoNumeroFactura" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    CONSTRAINT "PuntoExpedicion_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PuntoExpedicion_storeId_idx" ON "PuntoExpedicion"("storeId");
ALTER TABLE "PuntoExpedicion" ADD CONSTRAINT "PuntoExpedicion_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Estacion" ADD COLUMN "puntoExpedicionId" TEXT;
ALTER TABLE "Estacion" ADD CONSTRAINT "Estacion_puntoExpedicionId_fkey"
  FOREIGN KEY ("puntoExpedicionId") REFERENCES "PuntoExpedicion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "VentaPosItem" ADD COLUMN "iva" TEXT NOT NULL DEFAULT 'gravado10';

ALTER TABLE "VentaPos" ADD COLUMN "comprobanteTipo" TEXT NOT NULL DEFAULT 'ticket';
ALTER TABLE "VentaPos" ADD COLUMN "facturaRazonSocial" TEXT;
ALTER TABLE "VentaPos" ADD COLUMN "facturaRuc" TEXT;
ALTER TABLE "VentaPos" ADD COLUMN "facturaNumero" TEXT;
ALTER TABLE "VentaPos" ADD COLUMN "facturaTimbrado" TEXT;
ALTER TABLE "VentaPos" ADD COLUMN "facturaVencimiento" TIMESTAMP(3);
ALTER TABLE "VentaPos" ADD COLUMN "facturaGravado10" DECIMAL(10,2);
ALTER TABLE "VentaPos" ADD COLUMN "facturaGravado5" DECIMAL(10,2);
ALTER TABLE "VentaPos" ADD COLUMN "facturaExento" DECIMAL(10,2);
ALTER TABLE "VentaPos" ADD COLUMN "facturaIva10" DECIMAL(10,2);
ALTER TABLE "VentaPos" ADD COLUMN "facturaIva5" DECIMAL(10,2);
