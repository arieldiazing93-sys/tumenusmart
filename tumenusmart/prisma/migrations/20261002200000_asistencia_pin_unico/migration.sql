-- Registro de asistencia: el PIN identifica a la persona (único por local), la marcación que toca se decide sola
-- y el tiempo mínimo entre marcaciones es configurable. Todo idempotente: se puede correr de nuevo sin romper nada.

-- El celular fijo: bloqueo contra adivinar PIN y tiempo mínimo entre marcaciones.
ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "intentosPinAsistencia" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "bloqueoAsistenciaHasta" TIMESTAMP(3);
ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "minutosEntreMarcas" INTEGER NOT NULL DEFAULT 5;

-- Colaborador: la huella del PIN (única por local) y si sale a almorzar.
ALTER TABLE "Colaborador" ADD COLUMN IF NOT EXISTS "pinClave" TEXT;
ALTER TABLE "Colaborador" ADD COLUMN IF NOT EXISTS "haceAlmuerzo" BOOLEAN NOT NULL DEFAULT true;
CREATE UNIQUE INDEX IF NOT EXISTS "Colaborador_storeId_pinClave_key" ON "Colaborador"("storeId", "pinClave");

-- Ya no se usan: el PIN ya no se cifra con scrypt ni se bloquea por persona (ahora se bloquea el celular).
ALTER TABLE "Colaborador" DROP COLUMN IF EXISTS "pinHash";
ALTER TABLE "Colaborador" DROP COLUMN IF EXISTS "intentosFallidos";
ALTER TABLE "Colaborador" DROP COLUMN IF EXISTS "bloqueadoHasta";
