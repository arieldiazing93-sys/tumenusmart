-- AlterTable
ALTER TABLE "Store" ADD COLUMN "aceptaTarjetaDebito" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Store" ADD COLUMN "aceptaTarjetaCredito" BOOLEAN NOT NULL DEFAULT true;

-- Los locales que ya habían destildado "Tarjeta" arrancan con las dos
-- nuevas también destildadas, para no reabrir un método de pago que el
-- dueño había apagado a propósito.
UPDATE "Store" SET "aceptaTarjetaDebito" = "aceptaTarjeta", "aceptaTarjetaCredito" = "aceptaTarjeta";

ALTER TABLE "Store" DROP COLUMN "aceptaTarjeta";
