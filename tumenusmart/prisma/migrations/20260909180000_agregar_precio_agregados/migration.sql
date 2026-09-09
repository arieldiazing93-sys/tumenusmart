-- AlterTable
-- El default en 0 es solo para los pedidos VIEJOS (de antes de que esta
-- columna existiera): a los pedidos nuevos el checkout siempre les manda un
-- valor explícito.
ALTER TABLE "OrderItem" ADD COLUMN "precioAgregados" DECIMAL(10,2) NOT NULL DEFAULT 0;
