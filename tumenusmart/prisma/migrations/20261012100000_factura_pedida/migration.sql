-- Pedidos de la carta digital: la factura se carga a mano.
--
-- El cliente puede pedir factura en el checkout, pero sus datos (RUC, razon social, correo) YA NO se guardan en el pedido: viajan
-- solo en el mensaje de WhatsApp y la caja los carga a mano, despues de consultarlos en la DNIT, con "Emitir factura". Esta
-- columna solo dice "el cliente pidio factura": mientras sea verdadera y el pedido no tenga numero de factura, no pasa a
-- "en despacho" ni a "entregado".
--
-- Se puede correr de nuevo sin romper nada (IF NOT EXISTS). Los pedidos que ya existen quedan en falso (no cambia nada para ellos).

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "facturaPedida" BOOLEAN NOT NULL DEFAULT false;
