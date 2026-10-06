-- Servicio delivery: el canal de ventas por delivery. La caja abre una cuenta con los datos del cliente y su dirección, le carga
-- productos (como las cuentas del comedor), sale con un repartidor y se cobra. Tablas propias: no tocan las del comedor.
-- Todo con IF NOT EXISTS / DROP IF EXISTS: se puede correr de nuevo sin romper nada.

-- El correlativo de las cuentas de delivery, en el local.
ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "contadorCuentasDelivery" INTEGER NOT NULL DEFAULT 0;

-- La línea "Costo de envío" de una venta de delivery (suma al total y a la factura, pero no es un producto).
ALTER TABLE "VentaPosItem" ADD COLUMN IF NOT EXISTS "esEnvio" BOOLEAN NOT NULL DEFAULT false;

-- Cuentas de delivery.
CREATE TABLE IF NOT EXISTS "CuentaDelivery" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "numero" INTEGER NOT NULL,
  "estado" TEXT NOT NULL DEFAULT 'abierta',
  "customerId" TEXT,
  "clienteNombre" TEXT NOT NULL,
  "clienteTelefono" TEXT NOT NULL,
  "facturaTipoIdentificacion" TEXT,
  "facturaRuc" TEXT,
  "facturaRazonSocial" TEXT,
  "facturaEmail" TEXT,
  "direccion" TEXT,
  "clienteLat" DOUBLE PRECISION,
  "clienteLng" DOUBLE PRECISION,
  "deliveryZoneId" TEXT,
  "zonaNombre" TEXT,
  "costoEnvio" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "notas" TEXT,
  "repartidorId" TEXT,
  "entrega" TEXT NOT NULL DEFAULT 'pendiente',
  "salioEn" TIMESTAMP(3),
  "entregadaEn" TIMESTAMP(3),
  "abiertaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "cerradaEn" TIMESTAMP(3),
  "cerradaPor" TEXT,
  "motivoCierre" TEXT,
  "descuentoTipo" TEXT,
  "descuentoValor" DECIMAL(10,2),
  "descuentoMotivo" TEXT,
  "descuentoPor" TEXT,
  "impresaEn" TIMESTAMP(3),
  "impresaPor" TEXT,
  "ventaPosId" TEXT,
  CONSTRAINT "CuentaDelivery_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CuentaDelivery_storeId_numero_key" ON "CuentaDelivery"("storeId", "numero");
CREATE INDEX IF NOT EXISTS "CuentaDelivery_storeId_estado_idx" ON "CuentaDelivery"("storeId", "estado");
CREATE INDEX IF NOT EXISTS "CuentaDelivery_ventaPosId_idx" ON "CuentaDelivery"("ventaPosId");
CREATE INDEX IF NOT EXISTS "CuentaDelivery_repartidorId_idx" ON "CuentaDelivery"("repartidorId");
ALTER TABLE "CuentaDelivery" DROP CONSTRAINT IF EXISTS "CuentaDelivery_storeId_fkey";
ALTER TABLE "CuentaDelivery" ADD CONSTRAINT "CuentaDelivery_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CuentaDelivery" DROP CONSTRAINT IF EXISTS "CuentaDelivery_customerId_fkey";
ALTER TABLE "CuentaDelivery" ADD CONSTRAINT "CuentaDelivery_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CuentaDelivery" DROP CONSTRAINT IF EXISTS "CuentaDelivery_deliveryZoneId_fkey";
ALTER TABLE "CuentaDelivery" ADD CONSTRAINT "CuentaDelivery_deliveryZoneId_fkey"
  FOREIGN KEY ("deliveryZoneId") REFERENCES "DeliveryZone"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CuentaDelivery" DROP CONSTRAINT IF EXISTS "CuentaDelivery_repartidorId_fkey";
ALTER TABLE "CuentaDelivery" ADD CONSTRAINT "CuentaDelivery_repartidorId_fkey"
  FOREIGN KEY ("repartidorId") REFERENCES "Repartidor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Productos de una cuenta de delivery.
CREATE TABLE IF NOT EXISTS "ItemCuentaDelivery" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "cuentaId" TEXT NOT NULL,
  "ronda" INTEGER NOT NULL,
  "envioId" TEXT NOT NULL,
  "linea" INTEGER NOT NULL,
  "cargadoPor" TEXT,
  "productId" TEXT,
  "nombreProducto" TEXT NOT NULL,
  "cantidad" INTEGER NOT NULL,
  "precioUnitario" DECIMAL(10,2) NOT NULL,
  "iva" TEXT NOT NULL DEFAULT 'gravado10',
  "opcionesTexto" TEXT,
  "ingredientesQuitadosTexto" TEXT,
  "nota" TEXT,
  "costoProducto" DECIMAL(10,2),
  "costoAgregados" DECIMAL(10,2),
  "precioAgregados" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "areaImpresionId" TEXT,
  "consumo" JSONB NOT NULL DEFAULT '[]',
  "estado" TEXT NOT NULL DEFAULT 'activo',
  "anuladoPor" TEXT,
  "anuladoEn" TIMESTAMP(3),
  "motivoAnulacion" TEXT,
  "enviadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ItemCuentaDelivery_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ItemCuentaDelivery_storeId_envioId_linea_key" ON "ItemCuentaDelivery"("storeId", "envioId", "linea");
CREATE INDEX IF NOT EXISTS "ItemCuentaDelivery_storeId_idx" ON "ItemCuentaDelivery"("storeId");
CREATE INDEX IF NOT EXISTS "ItemCuentaDelivery_cuentaId_idx" ON "ItemCuentaDelivery"("cuentaId");
ALTER TABLE "ItemCuentaDelivery" DROP CONSTRAINT IF EXISTS "ItemCuentaDelivery_storeId_fkey";
ALTER TABLE "ItemCuentaDelivery" ADD CONSTRAINT "ItemCuentaDelivery_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ItemCuentaDelivery" DROP CONSTRAINT IF EXISTS "ItemCuentaDelivery_cuentaId_fkey";
ALTER TABLE "ItemCuentaDelivery" ADD CONSTRAINT "ItemCuentaDelivery_cuentaId_fkey"
  FOREIGN KEY ("cuentaId") REFERENCES "CuentaDelivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- La cola de impresión: los trabajos de una cuenta de delivery.
ALTER TABLE "TrabajoImpresion" ADD COLUMN IF NOT EXISTS "cuentaDeliveryId" TEXT;
CREATE INDEX IF NOT EXISTS "TrabajoImpresion_cuentaDeliveryId_idx" ON "TrabajoImpresion"("cuentaDeliveryId");
ALTER TABLE "TrabajoImpresion" DROP CONSTRAINT IF EXISTS "TrabajoImpresion_cuentaDeliveryId_fkey";
ALTER TABLE "TrabajoImpresion" ADD CONSTRAINT "TrabajoImpresion_cuentaDeliveryId_fkey"
  FOREIGN KEY ("cuentaDeliveryId") REFERENCES "CuentaDelivery"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- El stock que baja al cargar un producto en una cuenta de delivery queda enlazado a su cuenta.
ALTER TABLE "MovimientoStock" ADD COLUMN IF NOT EXISTS "cuentaDeliveryId" TEXT;
CREATE INDEX IF NOT EXISTS "MovimientoStock_cuentaDeliveryId_idx" ON "MovimientoStock"("cuentaDeliveryId");
ALTER TABLE "MovimientoStock" DROP CONSTRAINT IF EXISTS "MovimientoStock_cuentaDeliveryId_fkey";
ALTER TABLE "MovimientoStock" ADD CONSTRAINT "MovimientoStock_cuentaDeliveryId_fkey"
  FOREIGN KEY ("cuentaDeliveryId") REFERENCES "CuentaDelivery"("id") ON DELETE SET NULL ON UPDATE CASCADE;
