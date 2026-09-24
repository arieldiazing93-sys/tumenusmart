-- CreateTable
CREATE TABLE "Bitacora" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "usuario" TEXT NOT NULL,
    "usuarioEmail" TEXT NOT NULL,
    "usuarioRol" TEXT,
    "modulo" TEXT NOT NULL,
    "accion" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "entidad" TEXT,
    "entidadId" TEXT,
    "detalle" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bitacora_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Bitacora_storeId_createdAt_idx" ON "Bitacora"("storeId", "createdAt");
CREATE INDEX "Bitacora_storeId_modulo_idx" ON "Bitacora"("storeId", "modulo");
CREATE INDEX "Bitacora_storeId_usuarioEmail_idx" ON "Bitacora"("storeId", "usuarioEmail");

-- AddForeignKey
ALTER TABLE "Bitacora" ADD CONSTRAINT "Bitacora_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
