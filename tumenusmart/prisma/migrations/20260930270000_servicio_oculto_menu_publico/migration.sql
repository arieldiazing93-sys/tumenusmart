-- Un servicio se puede ocultar de la página pública de reservas y seguir
-- disponible para agregarlo a mano desde la ficha de una cita (ej. una
-- seña/extra con precio abierto que solo carga el dueño).
ALTER TABLE "ServicioAgenda" ADD COLUMN "ocultoEnMenuPublico" BOOLEAN NOT NULL DEFAULT false;
