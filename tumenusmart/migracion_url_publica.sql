-- ===========================================================================
--  Cambiar la dirección pública de un local sin romper lo ya impreso
-- ===========================================================================
--  Guarda las URLs que el local tuvo antes. Cuando alguien entra por una
--  vieja (un QR pegado en la mesa, un enlace que quedó en un grupo de
--  WhatsApp), la carta lo lleva sola a la nueva en vez de darle un 404.
--
--  Es seguro correrla más de una vez.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS "SlugAnterior" (
  "id"       TEXT NOT NULL,
  "slug"     TEXT NOT NULL,
  "storeId"  TEXT NOT NULL,
  "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SlugAnterior_pkey" PRIMARY KEY ("id")
);

-- Único: una dirección vieja no puede apuntar a dos locales distintos, o el
-- redirect no sabría a cuál mandar.
CREATE UNIQUE INDEX IF NOT EXISTS "SlugAnterior_slug_key" ON "SlugAnterior"("slug");
CREATE INDEX IF NOT EXISTS "SlugAnterior_storeId_idx" ON "SlugAnterior"("storeId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SlugAnterior_storeId_fkey'
  ) THEN
    ALTER TABLE "SlugAnterior"
      ADD CONSTRAINT "SlugAnterior_storeId_fkey"
      FOREIGN KEY ("storeId") REFERENCES "Store"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
