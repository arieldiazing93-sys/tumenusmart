-- CreateTable
CREATE TABLE "CategoriaHorario" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "diaSemana" INTEGER NOT NULL,
    "abre" TEXT NOT NULL,
    "cierra" TEXT NOT NULL,

    CONSTRAINT "CategoriaHorario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CategoriaHorario_storeId_idx" ON "CategoriaHorario"("storeId");

-- CreateIndex
CREATE INDEX "CategoriaHorario_categoryId_idx" ON "CategoriaHorario"("categoryId");

-- AddForeignKey
ALTER TABLE "CategoriaHorario" ADD CONSTRAINT "CategoriaHorario_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoriaHorario" ADD CONSTRAINT "CategoriaHorario_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
