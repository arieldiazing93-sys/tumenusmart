-- Servicios de la Reserva de turnos (cortes, barba, color…).
--
-- El servicio en sí es un Product con esServicio = true (así se vende en el
-- punto de venta y se factura). Acá se agrega lo propio de la agenda: la marca
-- de "categoría de servicios", la duración / búfer / color de cada servicio y
-- quién lo realiza. Aditiva pura: nada existente cambia.

ALTER TABLE "Category" ADD COLUMN "paraServicios" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "ServicioAgenda" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "duracionMin" INTEGER NOT NULL,
  "bufferMin" INTEGER NOT NULL DEFAULT 0,
  "tipoPrecio" TEXT NOT NULL DEFAULT 'fijo',
  "color" TEXT NOT NULL DEFAULT '#3B82F6',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ServicioAgenda_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ServicioAgenda_duracion_positiva" CHECK ("duracionMin" > 0),
  CONSTRAINT "ServicioAgenda_buffer_no_negativo" CHECK ("bufferMin" >= 0)
);

CREATE UNIQUE INDEX "ServicioAgenda_productId_key" ON "ServicioAgenda"("productId");
CREATE INDEX "ServicioAgenda_storeId_idx" ON "ServicioAgenda"("storeId");

ALTER TABLE "ServicioAgenda" ADD CONSTRAINT "ServicioAgenda_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServicioAgenda" ADD CONSTRAINT "ServicioAgenda_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ServicioPersonal" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "servicioId" TEXT NOT NULL,
  "personalId" TEXT NOT NULL,
  CONSTRAINT "ServicioPersonal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ServicioPersonal_servicioId_personalId_key" ON "ServicioPersonal"("servicioId", "personalId");
CREATE INDEX "ServicioPersonal_storeId_idx" ON "ServicioPersonal"("storeId");
CREATE INDEX "ServicioPersonal_personalId_idx" ON "ServicioPersonal"("personalId");

ALTER TABLE "ServicioPersonal" ADD CONSTRAINT "ServicioPersonal_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServicioPersonal" ADD CONSTRAINT "ServicioPersonal_servicioId_fkey"
  FOREIGN KEY ("servicioId") REFERENCES "ServicioAgenda"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServicioPersonal" ADD CONSTRAINT "ServicioPersonal_personalId_fkey"
  FOREIGN KEY ("personalId") REFERENCES "MiembroPersonal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
