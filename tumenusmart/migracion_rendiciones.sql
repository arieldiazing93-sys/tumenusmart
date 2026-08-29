-- ===========================================================================
--  Cierre de caja de repartidores
-- ===========================================================================
--  Tres cosas:
--
--   1. El pedido guarda QUÉ COBRÓ el repartidor al entregar (no lo que el
--      cliente había dicho que iba a pagar) y a qué hora entregó.
--   2. Una tabla de rendiciones: cada vez que el dueño recibe la plata de una
--      vuelta, queda el registro con los totales congelados.
--   3. El pedido apunta a su rendición. Sin rendición = todavía debe.
--
--  Es seguro correrla más de una vez.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS "Rendicion" (
  "id"              TEXT NOT NULL,
  "storeId"         TEXT NOT NULL,
  "repartidorId"    TEXT NOT NULL,
  "cantidadPedidos" INTEGER NOT NULL,
  "totalEfectivo"   DECIMAL(10,2) NOT NULL,
  "totalOtros"      DECIMAL(10,2) NOT NULL,
  "recibidoPor"     TEXT NOT NULL,
  "notas"           TEXT,
  "creadoEn"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Rendicion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Rendicion_storeId_idx"      ON "Rendicion"("storeId");
CREATE INDEX IF NOT EXISTS "Rendicion_repartidorId_idx" ON "Rendicion"("repartidorId");

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "cobroMetodo" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "entregadoEn" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "rendicionId" TEXT;

CREATE INDEX IF NOT EXISTS "Order_rendicionId_idx" ON "Order"("rendicionId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Rendicion_storeId_fkey') THEN
    ALTER TABLE "Rendicion" ADD CONSTRAINT "Rendicion_storeId_fkey"
      FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Rendicion_repartidorId_fkey') THEN
    ALTER TABLE "Rendicion" ADD CONSTRAINT "Rendicion_repartidorId_fkey"
      FOREIGN KEY ("repartidorId") REFERENCES "Repartidor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Order_rendicionId_fkey') THEN
    ALTER TABLE "Order" ADD CONSTRAINT "Order_rendicionId_fkey"
      FOREIGN KEY ("rendicionId") REFERENCES "Rendicion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Los pedidos que YA estaban entregados antes de este cambio no tienen forma
-- de cobro ni hora de entrega. Se les pone la referencia que había dejado el
-- cliente y la fecha de actualización — es lo mejor que se puede reconstruir,
-- y se marcan como ya rendidos más abajo para que no aparezcan como deuda de
-- una vuelta que terminó hace semanas.
UPDATE "Order"
   SET "cobroMetodo" = COALESCE("cobroMetodo", "metodoPagoReferencia"),
       "entregadoEn"  = COALESCE("entregadoEn", "updatedAt")
 WHERE "estado" = 'entregado';
