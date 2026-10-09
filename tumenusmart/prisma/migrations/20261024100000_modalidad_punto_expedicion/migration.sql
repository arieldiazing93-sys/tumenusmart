-- El tipo de timbrado de cada punto de expedición: "autoimpresor" (como hasta ahora) o "electronico" (facturación electrónica SIFEN).
-- Los puntos que ya existen quedan como autoimpresor. Se puede correr de nuevo sin romper nada.

ALTER TABLE "PuntoExpedicion" ADD COLUMN IF NOT EXISTS "modalidad" TEXT NOT NULL DEFAULT 'autoimpresor';
