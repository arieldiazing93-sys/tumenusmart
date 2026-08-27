-- ===========================================================================
--  Registro de errores en producción
-- ===========================================================================
--  Una fila = UN problema, no una vez que falló. Los errores se agrupan por
--  su "huella", así que el mismo bug con distintos ids suma ocurrencias en
--  lugar de crear filas nuevas.
--
--  Sin esa agrupación la tabla crecería sin control y la pantalla sería
--  ilegible: doscientas líneas iguales no se miran.
--
--  Se puede correr de nuevo sin problema.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS "ErrorReportado" (
  id            TEXT PRIMARY KEY,
  huella        TEXT NOT NULL,
  "storeId"     TEXT,
  "nombreLocal" TEXT,
  ruta          TEXT NOT NULL,
  mensaje       TEXT NOT NULL,
  detalle       TEXT,
  usuario       TEXT,
  ocurrencias   INTEGER NOT NULL DEFAULT 1,
  "primeraVez"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  "ultimaVez"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "avisadoEn"   TIMESTAMPTZ,
  resuelto      BOOLEAN NOT NULL DEFAULT false
);

-- La huella es única: es lo que hace que el mismo problema sume ocurrencias
-- en vez de multiplicar filas.
CREATE UNIQUE INDEX IF NOT EXISTS "ErrorReportado_huella_key"
  ON "ErrorReportado" (huella);

-- Para la pantalla: los sin resolver, más recientes primero.
CREATE INDEX IF NOT EXISTS "ErrorReportado_resuelto_ultimaVez_idx"
  ON "ErrorReportado" (resuelto, "ultimaVez" DESC);

CREATE INDEX IF NOT EXISTS "ErrorReportado_storeId_idx"
  ON "ErrorReportado" ("storeId");

SELECT 'Tabla de errores lista' AS resultado;
