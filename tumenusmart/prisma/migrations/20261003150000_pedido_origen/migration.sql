-- Pedidos cargados a mano (el cliente llamó por teléfono): de dónde entró cada pedido.
-- Los pedidos que ya existen quedan como "menu" (los armó el cliente en la carta digital).
-- Idempotente: se puede correr de nuevo sin romper nada.

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "origen" TEXT NOT NULL DEFAULT 'menu';
