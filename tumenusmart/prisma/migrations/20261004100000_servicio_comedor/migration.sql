-- Servicio comedor (Fase 1): el mozo carga la cuenta de una mesa desde su celular o tablet y la comanda sale en las
-- impresoras de la estación de caja. Mozos, cuentas de mesa, sus productos y la cola de impresión.
-- Todo con IF NOT EXISTS / DROP IF EXISTS: se puede correr de nuevo sin romper nada.

-- El enlace público del mozo y el freno a la adivinanza de PIN, en el local.
ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "tokenMozos" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Store_tokenMozos_key" ON "Store"("tokenMozos");
ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "intentosPinMozos" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "bloqueoMozosHasta" TIMESTAMP(3);
ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "contadorCuentasMesa" INTEGER NOT NULL DEFAULT 0;

-- El latido de la estación que está imprimiendo.
ALTER TABLE "Estacion" ADD COLUMN IF NOT EXISTS "impresionVistaEn" TIMESTAMP(3);

-- Mozos.
CREATE TABLE IF NOT EXISTS "Mozo" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "nombre" TEXT NOT NULL,
  "apellido" TEXT,
  "pinClave" TEXT,
  "activo" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Mozo_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Mozo_storeId_pinClave_key" ON "Mozo"("storeId", "pinClave");
CREATE INDEX IF NOT EXISTS "Mozo_storeId_idx" ON "Mozo"("storeId");
ALTER TABLE "Mozo" DROP CONSTRAINT IF EXISTS "Mozo_storeId_fkey";
ALTER TABLE "Mozo" ADD CONSTRAINT "Mozo_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Cuentas de mesa.
CREATE TABLE IF NOT EXISTS "CuentaMesa" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "numero" INTEGER NOT NULL,
  "mesa" TEXT NOT NULL,
  "mesaAbierta" TEXT,
  "mozoId" TEXT NOT NULL,
  "estado" TEXT NOT NULL DEFAULT 'abierta',
  "comensales" INTEGER,
  "nota" TEXT,
  "abiertaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "cerradaEn" TIMESTAMP(3),
  CONSTRAINT "CuentaMesa_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CuentaMesa_storeId_numero_key" ON "CuentaMesa"("storeId", "numero");
CREATE UNIQUE INDEX IF NOT EXISTS "CuentaMesa_storeId_mesaAbierta_key" ON "CuentaMesa"("storeId", "mesaAbierta");
CREATE INDEX IF NOT EXISTS "CuentaMesa_storeId_estado_idx" ON "CuentaMesa"("storeId", "estado");
ALTER TABLE "CuentaMesa" DROP CONSTRAINT IF EXISTS "CuentaMesa_storeId_fkey";
ALTER TABLE "CuentaMesa" ADD CONSTRAINT "CuentaMesa_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CuentaMesa" DROP CONSTRAINT IF EXISTS "CuentaMesa_mozoId_fkey";
ALTER TABLE "CuentaMesa" ADD CONSTRAINT "CuentaMesa_mozoId_fkey"
  FOREIGN KEY ("mozoId") REFERENCES "Mozo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Productos de una cuenta.
CREATE TABLE IF NOT EXISTS "ItemCuentaMesa" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "cuentaId" TEXT NOT NULL,
  "ronda" INTEGER NOT NULL,
  "envioId" TEXT NOT NULL,
  "linea" INTEGER NOT NULL,
  "mozoId" TEXT NOT NULL,
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
  CONSTRAINT "ItemCuentaMesa_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ItemCuentaMesa_storeId_envioId_linea_key" ON "ItemCuentaMesa"("storeId", "envioId", "linea");
CREATE INDEX IF NOT EXISTS "ItemCuentaMesa_storeId_idx" ON "ItemCuentaMesa"("storeId");
CREATE INDEX IF NOT EXISTS "ItemCuentaMesa_cuentaId_idx" ON "ItemCuentaMesa"("cuentaId");
ALTER TABLE "ItemCuentaMesa" DROP CONSTRAINT IF EXISTS "ItemCuentaMesa_storeId_fkey";
ALTER TABLE "ItemCuentaMesa" ADD CONSTRAINT "ItemCuentaMesa_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ItemCuentaMesa" DROP CONSTRAINT IF EXISTS "ItemCuentaMesa_cuentaId_fkey";
ALTER TABLE "ItemCuentaMesa" ADD CONSTRAINT "ItemCuentaMesa_cuentaId_fkey"
  FOREIGN KEY ("cuentaId") REFERENCES "CuentaMesa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ItemCuentaMesa" DROP CONSTRAINT IF EXISTS "ItemCuentaMesa_mozoId_fkey";
ALTER TABLE "ItemCuentaMesa" ADD CONSTRAINT "ItemCuentaMesa_mozoId_fkey"
  FOREIGN KEY ("mozoId") REFERENCES "Mozo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Cola de impresión.
CREATE TABLE IF NOT EXISTS "TrabajoImpresion" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "tipo" TEXT NOT NULL,
  "titulo" TEXT NOT NULL,
  "areaImpresionId" TEXT,
  "contenido" TEXT NOT NULL,
  "estado" TEXT NOT NULL DEFAULT 'pendiente',
  "intentos" INTEGER NOT NULL DEFAULT 0,
  "estacionId" TEXT,
  "reclamadoEn" TIMESTAMP(3),
  "impresoEn" TIMESTAMP(3),
  "error" TEXT,
  "cuentaMesaId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TrabajoImpresion_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "TrabajoImpresion_storeId_estado_idx" ON "TrabajoImpresion"("storeId", "estado");
CREATE INDEX IF NOT EXISTS "TrabajoImpresion_cuentaMesaId_idx" ON "TrabajoImpresion"("cuentaMesaId");
ALTER TABLE "TrabajoImpresion" DROP CONSTRAINT IF EXISTS "TrabajoImpresion_storeId_fkey";
ALTER TABLE "TrabajoImpresion" ADD CONSTRAINT "TrabajoImpresion_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrabajoImpresion" DROP CONSTRAINT IF EXISTS "TrabajoImpresion_cuentaMesaId_fkey";
ALTER TABLE "TrabajoImpresion" ADD CONSTRAINT "TrabajoImpresion_cuentaMesaId_fkey"
  FOREIGN KEY ("cuentaMesaId") REFERENCES "CuentaMesa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- El stock que baja al enviar un pedido de mesa queda enlazado a su cuenta.
ALTER TABLE "MovimientoStock" ADD COLUMN IF NOT EXISTS "cuentaMesaId" TEXT;
CREATE INDEX IF NOT EXISTS "MovimientoStock_cuentaMesaId_idx" ON "MovimientoStock"("cuentaMesaId");
ALTER TABLE "MovimientoStock" DROP CONSTRAINT IF EXISTS "MovimientoStock_cuentaMesaId_fkey";
ALTER TABLE "MovimientoStock" ADD CONSTRAINT "MovimientoStock_cuentaMesaId_fkey"
  FOREIGN KEY ("cuentaMesaId") REFERENCES "CuentaMesa"("id") ON DELETE SET NULL ON UPDATE CASCADE;
