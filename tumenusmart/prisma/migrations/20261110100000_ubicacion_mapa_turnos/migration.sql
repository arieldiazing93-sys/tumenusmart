-- Reserva de turnos: la página pública muestra el mapa de la ubicación del local (a partir de su enlace de Google Maps), al final.
-- Se guardan las coordenadas sacadas del enlace al guardar la página. Se puede correr de nuevo sin romper nada.

ALTER TABLE "PaginaReservas" ADD COLUMN IF NOT EXISTS "ubicacionLat" DOUBLE PRECISION;
ALTER TABLE "PaginaReservas" ADD COLUMN IF NOT EXISTS "ubicacionLng" DOUBLE PRECISION;
