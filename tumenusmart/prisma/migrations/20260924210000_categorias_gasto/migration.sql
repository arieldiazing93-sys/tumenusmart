-- CreateTable
CREATE TABLE "CategoriaGasto" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CategoriaGasto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CategoriaGasto_storeId_nombre_key" ON "CategoriaGasto"("storeId", "nombre");

-- AddForeignKey
ALTER TABLE "CategoriaGasto" ADD CONSTRAINT "CategoriaGasto_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
