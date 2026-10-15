-- Registro de asistencia: el dueño elige cómo se marca en el celular fijo: solo con PIN, o con PIN y cámara (reconocimiento de la cara).
-- Todos los locales siguen como hasta ahora (PIN y cámara) hasta que cambien la opción. Cada marcación guarda con qué método se hizo.
-- Se puede correr de nuevo sin romper nada.

ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "metodoAsistencia" TEXT NOT NULL DEFAULT 'pin_y_camara';
ALTER TABLE "MarcacionAsistencia" ADD COLUMN IF NOT EXISTS "metodo" TEXT NOT NULL DEFAULT 'pin_y_camara';
