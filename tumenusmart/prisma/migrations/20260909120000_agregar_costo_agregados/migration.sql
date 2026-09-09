-- AlterTable
ALTER TABLE "ProductOption" ADD COLUMN "costo" DECIMAL(10,2);

-- AlterTable
-- El default en 0 es solo para los pedidos VIEJOS (de antes de que esta
-- columna existiera): siguen reportando el mismo número que hoy, en vez de
-- pasar a "desconocido" de golpe. Los pedidos nuevos siempre mandan un
-- valor explícito desde el checkout (0, un número, o NULL si falta cargar
-- algún costo), nunca dependen de este default.
ALTER TABLE "OrderItem" ADD COLUMN "costoAgregados" DECIMAL(10,2) DEFAULT 0;
