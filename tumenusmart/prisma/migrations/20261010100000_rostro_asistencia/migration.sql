-- Registro de asistencia: reconocimiento de la cara. Al dar de alta a un colaborador se guarda su "rostro" (128 numeros que saca el
-- navegador de su selfie, NO la imagen) y al marcar el servidor compara el rostro de la selfie de ese momento con el guardado:
-- si es otra cara, la marcacion se rechaza. Cada marcacion guarda la distancia medida para poder ajustar el umbral con datos.
-- Todo con IF NOT EXISTS: se puede correr de nuevo sin romper nada. Los colaboradores que ya existen quedan con la lista vacia
-- (marcan como antes, sin la comprobacion, hasta que el dueño les registre el rostro en Asistencia -> Colaboradores).

ALTER TABLE "Colaborador" ADD COLUMN IF NOT EXISTS "rostro" DOUBLE PRECISION[] NOT NULL DEFAULT ARRAY[]::DOUBLE PRECISION[];
ALTER TABLE "Colaborador" ADD COLUMN IF NOT EXISTS "rostroRegistradoEn" TIMESTAMP(3);
ALTER TABLE "MarcacionAsistencia" ADD COLUMN IF NOT EXISTS "distanciaRostro" DOUBLE PRECISION;
