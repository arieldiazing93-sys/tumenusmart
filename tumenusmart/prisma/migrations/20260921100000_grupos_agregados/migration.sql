-- CreateTable
CREATE TABLE "OptionGroup" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "nombre" TEXT NOT NULL,
  "orden" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OptionGroup_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "OptionGroup_storeId_idx" ON "OptionGroup"("storeId");
ALTER TABLE "OptionGroup" ADD CONSTRAINT "OptionGroup_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
-- Un modificador es un Product real referenciado, no una fila con datos
-- propios (ver el comentario del modelo en schema.prisma).
CREATE TABLE "OptionGroupProduct" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "orden" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "OptionGroupProduct_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OptionGroupProduct_groupId_productId_key" ON "OptionGroupProduct"("groupId", "productId");
CREATE INDEX "OptionGroupProduct_storeId_idx" ON "OptionGroupProduct"("storeId");
CREATE INDEX "OptionGroupProduct_groupId_idx" ON "OptionGroupProduct"("groupId");
CREATE INDEX "OptionGroupProduct_productId_idx" ON "OptionGroupProduct"("productId");
ALTER TABLE "OptionGroupProduct" ADD CONSTRAINT "OptionGroupProduct_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OptionGroupProduct" ADD CONSTRAINT "OptionGroupProduct_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "OptionGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OptionGroupProduct" ADD CONSTRAINT "OptionGroupProduct_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "ProductOptionGroup" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "orden" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "ProductOptionGroup_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProductOptionGroup_productId_groupId_key" ON "ProductOptionGroup"("productId", "groupId");
CREATE INDEX "ProductOptionGroup_storeId_idx" ON "ProductOptionGroup"("storeId");
CREATE INDEX "ProductOptionGroup_productId_idx" ON "ProductOptionGroup"("productId");
CREATE INDEX "ProductOptionGroup_groupId_idx" ON "ProductOptionGroup"("groupId");
ALTER TABLE "ProductOptionGroup" ADD CONSTRAINT "ProductOptionGroup_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductOptionGroup" ADD CONSTRAINT "ProductOptionGroup_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductOptionGroup" ADD CONSTRAINT "ProductOptionGroup_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "OptionGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
