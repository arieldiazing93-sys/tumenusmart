-- Insumos elaborados (preparaciones): una salsa de tomate, una masa, un
-- aderezo… se arman con otros insumos y se usan en la receta de un producto.
-- Al vender, su consumo se "abre" en los insumos con que se preparan.
-- Aditiva pura: nada existente cambia (todos los insumos actuales quedan como
-- "no elaborado").

ALTER TABLE "Insumo" ADD COLUMN "esElaborado" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Insumo" ADD COLUMN "rindeTanda" DECIMAL(12,3);

CREATE TABLE "IngredienteElaborado" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "elaboradoId" TEXT NOT NULL,
  "ingredienteId" TEXT NOT NULL,
  "cantidad" DECIMAL(12,3) NOT NULL,
  CONSTRAINT "IngredienteElaborado_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "IngredienteElaborado_cantidad_positiva" CHECK ("cantidad" > 0),
  CONSTRAINT "IngredienteElaborado_no_se_contiene" CHECK ("elaboradoId" <> "ingredienteId")
);

CREATE UNIQUE INDEX "IngredienteElaborado_elaboradoId_ingredienteId_key"
  ON "IngredienteElaborado"("elaboradoId", "ingredienteId");
CREATE INDEX "IngredienteElaborado_storeId_idx" ON "IngredienteElaborado"("storeId");
CREATE INDEX "IngredienteElaborado_elaboradoId_idx" ON "IngredienteElaborado"("elaboradoId");
CREATE INDEX "IngredienteElaborado_ingredienteId_idx" ON "IngredienteElaborado"("ingredienteId");

ALTER TABLE "IngredienteElaborado" ADD CONSTRAINT "IngredienteElaborado_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IngredienteElaborado" ADD CONSTRAINT "IngredienteElaborado_elaboradoId_fkey"
  FOREIGN KEY ("elaboradoId") REFERENCES "Insumo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IngredienteElaborado" ADD CONSTRAINT "IngredienteElaborado_ingredienteId_fkey"
  FOREIGN KEY ("ingredienteId") REFERENCES "Insumo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
