-- Los datos del emisor que pide la factura electrónica (todos opcionales).
CREATE TABLE "EmisorFiscal" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "tipoContribuyente" TEXT,
    "tipoRegimen" INTEGER,
    "nombreFantasia" TEXT,
    "denominacionSucursal" TEXT,
    "telefono" TEXT,
    "email" TEXT,
    "direccion" TEXT,
    "numeroCasa" TEXT,
    "complemento" TEXT,
    "departamento" TEXT,
    "distritoCodigo" INTEGER,
    "distrito" TEXT,
    "ciudadCodigo" INTEGER,
    "ciudad" TEXT,
    "actividades" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmisorFiscal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmisorFiscal_storeId_key" ON "EmisorFiscal"("storeId");

ALTER TABLE "EmisorFiscal" ADD CONSTRAINT "EmisorFiscal_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Copia de esos datos dentro de cada comprobante, al emitirlo.
ALTER TABLE "Comprobante" ADD COLUMN "emisorDatos" JSONB;

-- Producto que es un servicio (no una mercadería).
ALTER TABLE "Product" ADD COLUMN "esServicio" BOOLEAN NOT NULL DEFAULT false;
