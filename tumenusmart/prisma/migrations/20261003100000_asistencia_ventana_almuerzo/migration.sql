-- Registro de asistencia: la marcación que toca (almuerzo o salida) se decide sola según la hora, con el horario de
-- almuerzo del negocio. Idempotente: se puede correr de nuevo sin romper nada.

ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "almuerzoDesde" TEXT NOT NULL DEFAULT '11:00';
ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "almuerzoHasta" TEXT NOT NULL DEFAULT '15:00';
ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "almuerzoMaxMin" INTEGER NOT NULL DEFAULT 180;
