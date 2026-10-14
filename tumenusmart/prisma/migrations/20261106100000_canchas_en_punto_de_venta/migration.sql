-- Reserva de canchas: cada cancha es un producto del punto de venta (alquiler por hora), agrupado en una categoría propia
-- («Fútbol 5», «Pádel»…), con su IVA. Así el cajero también puede cobrar en el mostrador a quien no reservó (1 h, 1 h 30…) con todos
-- los controles del POS. Se puede correr de nuevo sin romper nada.
--  - Category.paraCanchas: el grupo es de canchas (se ve en el POS, no en la carta pública ni en el menú del cliente).
--  - Cancha.categoriaId: el grupo donde se ve la cancha. Cancha.iva: el IVA con que se factura.

ALTER TABLE "Category" ADD COLUMN IF NOT EXISTS "paraCanchas" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Cancha" ADD COLUMN IF NOT EXISTS "categoriaId" TEXT;
ALTER TABLE "Cancha" ADD COLUMN IF NOT EXISTS "iva" TEXT NOT NULL DEFAULT 'gravado10';
