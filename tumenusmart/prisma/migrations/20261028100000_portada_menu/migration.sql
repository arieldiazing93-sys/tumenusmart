-- Foto de portada del menú digital: la franja de arriba de la carta pública. Es opcional; sin foto la portada sigue siendo el color de marca.
-- Se puede correr de nuevo sin romper nada.

ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "portadaUrl" TEXT;
