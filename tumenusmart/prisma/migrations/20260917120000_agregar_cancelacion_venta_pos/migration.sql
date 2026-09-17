-- AlterTable
ALTER TABLE "VentaPos" ADD COLUMN "cancelada" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "VentaPos" ADD COLUMN "canceladaPor" TEXT;
ALTER TABLE "VentaPos" ADD COLUMN "canceladaEn" TIMESTAMP(3);
ALTER TABLE "VentaPos" ADD COLUMN "motivoCancelacion" TEXT;
