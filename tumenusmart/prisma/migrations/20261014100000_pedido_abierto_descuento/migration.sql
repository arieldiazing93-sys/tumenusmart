-- El pedido se carga ABIERTO (como la cuenta de una mesa): la caja puede cargarle productos, darle un descuento o cancelar un
-- producto antes de cobrarlo. Estos campos guardan el descuento y lo que cada producto descontó del stock.
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "descuento" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "descuentoTipo" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "descuentoValor" DECIMAL(10,2);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "descuentoMotivo" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "descuentoPor" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "consumo" JSONB;
