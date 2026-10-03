-- Servicio comedor (Fase 2): la caja opera la cuenta de la mesa — descuento, anular productos, imprimir la cuenta
-- (queda "por cobrar"), reabrirla, cargar productos desde el panel y pagarla (genera una venta del Punto de Venta).
-- Todo con IF NOT EXISTS: se puede correr de nuevo sin romper nada.

-- Descuento general de la cuenta.
ALTER TABLE "CuentaMesa" ADD COLUMN IF NOT EXISTS "descuentoTipo" TEXT;
ALTER TABLE "CuentaMesa" ADD COLUMN IF NOT EXISTS "descuentoValor" DECIMAL(10,2);
ALTER TABLE "CuentaMesa" ADD COLUMN IF NOT EXISTS "descuentoMotivo" TEXT;
ALTER TABLE "CuentaMesa" ADD COLUMN IF NOT EXISTS "descuentoPor" TEXT;

-- Cuándo y quién imprimió la cuenta (estado "por_cobrar").
ALTER TABLE "CuentaMesa" ADD COLUMN IF NOT EXISTS "impresaEn" TIMESTAMP(3);
ALTER TABLE "CuentaMesa" ADD COLUMN IF NOT EXISTS "impresaPor" TEXT;

-- Quién y por qué cerró la cuenta, y la venta que generó al pagarse.
ALTER TABLE "CuentaMesa" ADD COLUMN IF NOT EXISTS "cerradaPor" TEXT;
ALTER TABLE "CuentaMesa" ADD COLUMN IF NOT EXISTS "motivoCierre" TEXT;
ALTER TABLE "CuentaMesa" ADD COLUMN IF NOT EXISTS "ventaPosId" TEXT;
CREATE INDEX IF NOT EXISTS "CuentaMesa_ventaPosId_idx" ON "CuentaMesa"("ventaPosId");

-- Quién cargó el producto cuando no fue el mozo sino la caja, desde el panel.
ALTER TABLE "ItemCuentaMesa" ADD COLUMN IF NOT EXISTS "cargadoPor" TEXT;
