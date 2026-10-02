-- Enlace a la ficha de Google Maps del negocio, para generar un QR de
-- "dejanos tu reseña" (estrellitas), igual que ya existe el QR de la
-- página de reservas.
ALTER TABLE "PaginaReservas" ADD COLUMN "googleMapsUrl" TEXT;
