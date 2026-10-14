-- Reserva de canchas: la página pública muestra el mapa de la ubicación del complejo (a partir de su enlace de Google Maps).
-- Se guardan las coordenadas sacadas del enlace al guardar la página. Se puede correr de nuevo sin romper nada.

ALTER TABLE "PaginaCanchas" ADD COLUMN IF NOT EXISTS "ubicacionLat" DOUBLE PRECISION;
ALTER TABLE "PaginaCanchas" ADD COLUMN IF NOT EXISTS "ubicacionLng" DOUBLE PRECISION;
