-- AlterTable
ALTER TABLE "VentaPos" ADD COLUMN "clienteNombre" TEXT;
ALTER TABLE "VentaPos" ADD COLUMN "clienteTelefono" TEXT;
ALTER TABLE "VentaPos" ADD COLUMN "tipoEntrega" TEXT NOT NULL DEFAULT 'local';
ALTER TABLE "VentaPos" ADD COLUMN "nota" TEXT;
