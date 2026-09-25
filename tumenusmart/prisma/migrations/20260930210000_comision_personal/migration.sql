-- Comisión por trabajo del personal.
--
-- MiembroPersonal gana su porcentaje de comisión (NULL = no cobra comisión) y cada
-- Cita guarda el porcentaje que tenía quien la atendió al momento de cobrarla, así
-- cambiar la comisión después no mueve lo que ya ganó. Aditiva pura: todo queda en NULL.

ALTER TABLE "MiembroPersonal" ADD COLUMN "comisionPorcentaje" DECIMAL(5,2);
ALTER TABLE "Cita" ADD COLUMN "comisionPorcentaje" DECIMAL(5,2);
