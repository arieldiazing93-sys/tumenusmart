ALTER TABLE "VentaPos" ADD COLUMN "facturaRazonSocialEmisor" TEXT;
ALTER TABLE "VentaPos" ADD COLUMN "facturaRucEmisor" TEXT;

CREATE TABLE "FacturaReemplazada" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "origen" TEXT NOT NULL,
    "orderId" TEXT,
    "ventaId" TEXT,
    "facturaNumero" TEXT NOT NULL,
    "facturaTimbrado" TEXT,
    "facturaVencimiento" TIMESTAMP(3),
    "facturaRazonSocial" TEXT,
    "facturaRuc" TEXT,
    "facturaTipoIdentificacion" TEXT,
    "anuladaPor" TEXT NOT NULL,
    "anuladaEn" TIMESTAMP(3) NOT NULL,
    "motivoAnulacion" TEXT NOT NULL,
    "facturaNuevaNumero" TEXT NOT NULL,
    "remitidaPor" TEXT NOT NULL,
    "remitidaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FacturaReemplazada_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FacturaReemplazada_storeId_idx" ON "FacturaReemplazada"("storeId");
CREATE INDEX "FacturaReemplazada_orderId_idx" ON "FacturaReemplazada"("orderId");
CREATE INDEX "FacturaReemplazada_ventaId_idx" ON "FacturaReemplazada"("ventaId");

ALTER TABLE "FacturaReemplazada" ADD CONSTRAINT "FacturaReemplazada_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FacturaReemplazada" ADD CONSTRAINT "FacturaReemplazada_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FacturaReemplazada" ADD CONSTRAINT "FacturaReemplazada_ventaId_fkey"
    FOREIGN KEY ("ventaId") REFERENCES "VentaPos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
