-- Pedidos del menú digital: confirmar el pedido mandándolo por WhatsApp. Con esto encendido (lo está de entrada), el pedido queda
-- «pendiente» hasta que el cliente toca «Enviar por WhatsApp» (tiene 3 minutos; si no, se cancela solo) y recién ahí entra a la bandeja
-- del personal. Apagado, el pedido entra apenas se envía, como antes. Se puede correr de nuevo sin romper nada.

ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "pedidosWebConfirmaWhatsapp" BOOLEAN NOT NULL DEFAULT true;
