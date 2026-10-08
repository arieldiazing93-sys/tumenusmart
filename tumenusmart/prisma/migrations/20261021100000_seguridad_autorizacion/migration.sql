-- Seguridad: el dueño elige en Ajustes qué acciones piden la contraseña de un usuario autorizado (descuentos, cancelar productos, cancelaciones,
-- reapertura de cuentas). Se guarda la lista de eventos protegidos en el local y el freno contra quien prueba contraseñas en ese cuadro
-- (mismas columnas y reglas que el freno de los PIN de mozos y asistencia).
-- Todo con IF NOT EXISTS: se puede correr de nuevo sin romper nada.

ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "seguridadEventos" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "intentosAutorizacion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "bloqueoAutorizacionHasta" TIMESTAMP(3);
ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "ultimoIntentoAutorizacionEn" TIMESTAMP(3);
