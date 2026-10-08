-- Perfiles de seguridad: "Administrador" (puede dar la autorización de todos los eventos protegidos) y "Caja" (solo de los que el dueño tilde en
-- Ajustes → Seguridad). Cada usuario tiene un perfil; sin uno guardado, el dueño es administrador y un empleado es caja (como hasta ahora:
-- solo el dueño autoriza, hasta que se le tilde algo a Caja).
-- Todo con IF NOT EXISTS: se puede correr de nuevo sin romper nada.

ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "seguridadPermisosCaja" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Usuario" ADD COLUMN IF NOT EXISTS "perfilSeguridad" TEXT;
