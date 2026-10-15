-- Registro de asistencia: los días que trabaja cada persona, cómo se le paga (mensual o jornal) y las ausencias justificadas
-- (reposo médico, avisó que no venía, vacaciones, feriado...). Todos los colaboradores que ya existen quedan trabajando de lunes a
-- sábado y sin forma de pago definida. Se puede correr de nuevo sin romper nada.

ALTER TABLE "Colaborador" ADD COLUMN IF NOT EXISTS "diasTrabajo" INTEGER[] NOT NULL DEFAULT ARRAY[1,2,3,4,5,6]::INTEGER[];
ALTER TABLE "Colaborador" ADD COLUMN IF NOT EXISTS "tipoPago" TEXT;
ALTER TABLE "Colaborador" ADD COLUMN IF NOT EXISTS "montoPago" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "AusenciaColaborador" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "colaboradorId" TEXT NOT NULL,
  "desde" TEXT NOT NULL,
  "hasta" TEXT NOT NULL,
  "tipo" TEXT NOT NULL,
  "pagado" BOOLEAN NOT NULL DEFAULT false,
  "nota" TEXT,
  "creadoPor" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AusenciaColaborador_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AusenciaColaborador_storeId_desde_idx" ON "AusenciaColaborador"("storeId", "desde");
CREATE INDEX IF NOT EXISTS "AusenciaColaborador_colaboradorId_desde_idx" ON "AusenciaColaborador"("colaboradorId", "desde");
ALTER TABLE "AusenciaColaborador" DROP CONSTRAINT IF EXISTS "AusenciaColaborador_storeId_fkey";
ALTER TABLE "AusenciaColaborador" ADD CONSTRAINT "AusenciaColaborador_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AusenciaColaborador" DROP CONSTRAINT IF EXISTS "AusenciaColaborador_colaboradorId_fkey";
ALTER TABLE "AusenciaColaborador" ADD CONSTRAINT "AusenciaColaborador_colaboradorId_fkey"
  FOREIGN KEY ("colaboradorId") REFERENCES "Colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE;
