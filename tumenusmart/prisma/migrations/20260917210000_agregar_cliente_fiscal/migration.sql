ALTER TABLE "Customer" ALTER COLUMN "telefono" DROP NOT NULL;
ALTER TABLE "Customer" ADD COLUMN "tipoIdentificacion" TEXT;
ALTER TABLE "Customer" ADD COLUMN "numeroIdentificacion" TEXT;
CREATE UNIQUE INDEX "Customer_storeId_tipoIdentificacion_numeroIdentificacion_key"
  ON "Customer"("storeId", "tipoIdentificacion", "numeroIdentificacion");

ALTER TABLE "VentaPos" ADD COLUMN "facturaTipoIdentificacion" TEXT;
