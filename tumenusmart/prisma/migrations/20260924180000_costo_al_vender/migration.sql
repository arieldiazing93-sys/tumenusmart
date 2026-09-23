-- Costo del producto al momento de la venta (snapshot), para Rentabilidad.
ALTER TABLE "OrderItem" ADD COLUMN "costoProducto" DECIMAL(10,2);

ALTER TABLE "VentaPosItem" ADD COLUMN "costoProducto" DECIMAL(10,2);
ALTER TABLE "VentaPosItem" ADD COLUMN "costoAgregados" DECIMAL(10,2);
ALTER TABLE "VentaPosItem" ADD COLUMN "precioAgregados" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- Las ventas viejas del mostrador SIN agregados tienen costo de agregados conocido: cero.
-- Las que sí llevaban agregados quedan en NULL (desconocido), como hasta ahora.
UPDATE "VentaPosItem" SET "costoAgregados" = 0 WHERE "opcionesTexto" IS NULL;
