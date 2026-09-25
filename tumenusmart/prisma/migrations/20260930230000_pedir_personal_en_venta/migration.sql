-- Punto de Venta con personal asignado al cobrar.
--
-- Los negocios donde llega gente sin reserva (barberías, salones) pueden activar, en
-- Reserva de turnos → Personal, que el Punto de Venta pregunte a quién se le asigna el
-- trabajo al cobrar. Este es el interruptor, apagado por defecto: los demás negocios no
-- ven nada distinto. Aditiva pura.

ALTER TABLE "Store" ADD COLUMN "pedirPersonalEnVenta" BOOLEAN NOT NULL DEFAULT false;
