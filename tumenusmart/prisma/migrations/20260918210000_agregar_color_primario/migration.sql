-- Color de marca personalizable por local, solo para el menú público — el
-- panel admin no cambia, sigue siendo naranja siempre.

ALTER TABLE "Store" ADD COLUMN "colorPrimario" TEXT;
