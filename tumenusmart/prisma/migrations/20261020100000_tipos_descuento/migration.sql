-- Tipos de descuento: el dueño crea en Ajustes descuentos con nombre y porcentaje fijo ("Cortesía" 100 %, "Tarjeta" 20 %) y al descontar una cuenta
-- por porcentaje se elige uno. El 100 % (una cortesía: la cuenta queda en cero) solo sale de uno de estos tipos.
-- Además la venta del mostrador anota el nombre del tipo que se eligió (para el reporte de Cancelaciones y descuentos).
-- Todo con IF NOT EXISTS / DROP IF EXISTS: se puede correr de nuevo sin romper nada.

CREATE TABLE IF NOT EXISTS "TipoDescuento" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "nombre" TEXT NOT NULL,
  "porcentaje" DECIMAL(5,2) NOT NULL,
  "activo" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TipoDescuento_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "TipoDescuento_storeId_nombre_key" ON "TipoDescuento"("storeId", "nombre");
CREATE INDEX IF NOT EXISTS "TipoDescuento_storeId_idx" ON "TipoDescuento"("storeId");
ALTER TABLE "TipoDescuento" DROP CONSTRAINT IF EXISTS "TipoDescuento_storeId_fkey";
ALTER TABLE "TipoDescuento" ADD CONSTRAINT "TipoDescuento_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- Red de seguridad: un porcentaje mayor a 0 y hasta 100.
ALTER TABLE "TipoDescuento" DROP CONSTRAINT IF EXISTS "TipoDescuento_porcentaje_check";
ALTER TABLE "TipoDescuento" ADD CONSTRAINT "TipoDescuento_porcentaje_check" CHECK ("porcentaje" > 0 AND "porcentaje" <= 100);

ALTER TABLE "VentaPos" ADD COLUMN IF NOT EXISTS "descuentoConcepto" TEXT;
