-- Seguridad del PIN (mozos y asistencia): cuando fue el ultimo intento, para que el conteo de intentos
-- arranque de cero pasado un rato sin intentos (en vez de borrarse con cualquier PIN correcto).
-- Con IF NOT EXISTS: se puede correr de nuevo sin romper nada.

ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "ultimoIntentoPinMozosEn" TIMESTAMP(3);
ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "ultimoIntentoPinAsistenciaEn" TIMESTAMP(3);
