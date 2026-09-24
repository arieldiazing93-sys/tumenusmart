-- CreateTable
CREATE TABLE "PagoVenta" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "ventaPosId" TEXT NOT NULL,
    "forma" TEXT NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PagoVenta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PagoVenta_storeId_idx" ON "PagoVenta"("storeId");

-- CreateIndex
CREATE INDEX "PagoVenta_ventaPosId_idx" ON "PagoVenta"("ventaPosId");

-- AddForeignKey
ALTER TABLE "PagoVenta" ADD CONSTRAINT "PagoVenta_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PagoVenta" ADD CONSTRAINT "PagoVenta_ventaPosId_fkey" FOREIGN KEY ("ventaPosId") REFERENCES "VentaPos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Las ventas que ya existían (todas de prueba) reciben su fila de pago, para
-- que sigan sumando en la caja y en los reportes: una fila por venta, con la
-- misma forma y el mismo total que ya tenían.
INSERT INTO "PagoVenta" ("id", "storeId", "ventaPosId", "forma", "monto", "orden")
SELECT 'pv_' || "id", "storeId", "id", "formaPago", "total", 0
FROM "VentaPos";
