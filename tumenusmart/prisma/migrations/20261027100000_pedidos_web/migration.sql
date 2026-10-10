-- Pedidos del menú digital: los pedidos entran al sistema (una bandeja de entrada) en vez de armar solo un mensaje de WhatsApp.
-- Cada local lo enciende en Configuración; mientras esté apagado el menú se comporta como siempre. Se puede correr de nuevo sin romper nada.

ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "contadorPedidosWeb" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "pedidosWebActivo" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "pedidosWebAutoAceptar" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "pedidosWebRubro" TEXT NOT NULL DEFAULT 'gastronomia';

CREATE TABLE IF NOT EXISTS "PedidoWeb" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "numero" INTEGER NOT NULL,
  "token" TEXT NOT NULL,
  "envioId" TEXT NOT NULL,
  "estado" TEXT NOT NULL DEFAULT 'nuevo',
  "tipoEntrega" TEXT NOT NULL,
  "clienteNombre" TEXT NOT NULL,
  "clienteTelefono" TEXT NOT NULL,
  "direccion" TEXT,
  "clienteLat" DOUBLE PRECISION,
  "clienteLng" DOUBLE PRECISION,
  "deliveryZoneId" TEXT,
  "zonaNombre" TEXT,
  "costoEnvio" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "envioACoordinar" BOOLEAN NOT NULL DEFAULT false,
  "notas" TEXT,
  "metodoPago" TEXT NOT NULL,
  "comprobanteTipo" TEXT NOT NULL DEFAULT 'ticket',
  "facturaTipoIdentificacion" TEXT,
  "facturaRuc" TEXT,
  "facturaRazonSocial" TEXT,
  "facturaEmail" TEXT,
  "items" JSONB NOT NULL,
  "lineas" JSONB NOT NULL,
  "subtotal" DECIMAL(12,2) NOT NULL,
  "total" DECIMAL(12,2) NOT NULL,
  "avisos" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "cuentaDeliveryId" TEXT,
  "motivoRechazo" TEXT,
  "aceptadoPor" TEXT,
  "aceptadoEn" TIMESTAMP(3),
  "listoEn" TIMESTAMP(3),
  "entregadoEn" TIMESTAMP(3),
  "resueltoPor" TEXT,
  "resueltoEn" TIMESTAMP(3),
  "ipHash" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PedidoWeb_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PedidoWeb_token_key" ON "PedidoWeb"("token");
CREATE UNIQUE INDEX IF NOT EXISTS "PedidoWeb_storeId_numero_key" ON "PedidoWeb"("storeId", "numero");
CREATE UNIQUE INDEX IF NOT EXISTS "PedidoWeb_storeId_envioId_key" ON "PedidoWeb"("storeId", "envioId");
CREATE INDEX IF NOT EXISTS "PedidoWeb_storeId_estado_idx" ON "PedidoWeb"("storeId", "estado");
CREATE INDEX IF NOT EXISTS "PedidoWeb_storeId_createdAt_idx" ON "PedidoWeb"("storeId", "createdAt");
CREATE INDEX IF NOT EXISTS "PedidoWeb_storeId_clienteTelefono_createdAt_idx" ON "PedidoWeb"("storeId", "clienteTelefono", "createdAt");
CREATE INDEX IF NOT EXISTS "PedidoWeb_storeId_ipHash_createdAt_idx" ON "PedidoWeb"("storeId", "ipHash", "createdAt");
ALTER TABLE "PedidoWeb" DROP CONSTRAINT IF EXISTS "PedidoWeb_storeId_fkey";
ALTER TABLE "PedidoWeb" ADD CONSTRAINT "PedidoWeb_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
