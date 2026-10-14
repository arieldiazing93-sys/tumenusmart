-- Servicio comedor: comisión del mozo por venta y productos por peso (kilogramo / litro) en las cuentas de mesa.
--  - Mozo.comisionPorcentaje: el % (0 a 100) que cobra el mozo sobre los PRODUCTOS de las cuentas que tiene a cargo. NULL = sin comisión.
--  - CuentaMesa.comisionMozoPorcentaje / comisionMozoBase: lo que valía al cobrar la cuenta (congelado): el % y la base de cálculo.
--  - ItemCuentaMesa.porPeso: la línea se pesó («Queso (285 g)»); al facturar su unidad es «unidad».
-- Se puede correr de nuevo sin romper nada.

ALTER TABLE "Mozo" ADD COLUMN IF NOT EXISTS "comisionPorcentaje" DECIMAL(5,2);
ALTER TABLE "CuentaMesa" ADD COLUMN IF NOT EXISTS "comisionMozoPorcentaje" DECIMAL(5,2);
ALTER TABLE "CuentaMesa" ADD COLUMN IF NOT EXISTS "comisionMozoBase" DECIMAL(10,2);
ALTER TABLE "ItemCuentaMesa" ADD COLUMN IF NOT EXISTS "porPeso" BOOLEAN NOT NULL DEFAULT false;
