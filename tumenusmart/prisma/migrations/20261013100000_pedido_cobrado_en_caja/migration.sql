-- Pedidos: el menu digital ya no crea pedidos; todo entra como pedido manual y se COBRA al cargarlo.
--
-- El cliente arma su pedido en el menu y lo manda por WhatsApp; la caja lo carga a mano (Pedidos > Nuevo pedido) y en ese momento
-- queda cobrado: entra a la caja del turno abierto (formaPagoPos + turnoPosId) y, si es factura, se emite en el acto. "cobradoEn" es la
-- fecha de esa venta (updatedAt no sirve: cambia con cada paso de la entrega).
--
--  * Se agrega Order.cobradoEn y se completa en los pedidos que ya estaban atados a un turno (se usa su ultima modificacion, que
--    era cuando se cobraban en el modelo anterior).
--  * Se quita Order.facturaPedida (la marca de "el cliente pidio factura desde la carta"): ya no hay pedidos que nazcan de la carta.
--
-- Se puede correr de nuevo sin romper nada (IF NOT EXISTS / IF EXISTS).

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "cobradoEn" TIMESTAMP(3);
UPDATE "Order" SET "cobradoEn" = "updatedAt" WHERE "turnoPosId" IS NOT NULL AND "cobradoEn" IS NULL;
ALTER TABLE "Order" DROP COLUMN IF EXISTS "facturaPedida";
