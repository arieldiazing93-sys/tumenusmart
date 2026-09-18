ALTER TABLE "Store" ADD COLUMN "facturaObligatoria" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Order" ADD COLUMN "facturaTipoIdentificacion" TEXT;
