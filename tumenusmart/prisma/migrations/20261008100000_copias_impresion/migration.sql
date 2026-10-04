-- Impresion: cuantas copias sale cada impresion en una estacion (0 = no se imprime, 2 = sale dos veces).
-- Todo con IF NOT EXISTS: se puede correr de nuevo sin romper nada. Lo que ya existe queda en 1 copia, como hasta ahora.

ALTER TABLE "EstacionImpresora" ADD COLUMN IF NOT EXISTS "copias" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Estacion" ADD COLUMN IF NOT EXISTS "copiasFactura" INTEGER NOT NULL DEFAULT 1;
