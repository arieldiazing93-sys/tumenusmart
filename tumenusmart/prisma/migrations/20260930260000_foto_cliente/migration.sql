-- Último peinado/corte del cliente (Reserva de turnos): se pisa cada vez
-- que se sube una foto nueva, no es una galería.
ALTER TABLE "Customer" ADD COLUMN "fotoUrl" TEXT;
