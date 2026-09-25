-- Reserva de turnos desde la página pública: el cliente elige servicios,
-- profesional, día y hora, y deja sus datos.
--
-- Cita gana los datos del cliente, el tiempo de búfer, el origen (panel o web) y
-- si ya se ve en el calendario (un turno pedido por la web puede quedar oculto
-- hasta que el cliente mande el aviso por WhatsApp). Y cada turno guarda sus
-- servicios en CitaServicio. Aditiva pura: los turnos que ya existan quedan como
-- cargados desde el panel y visibles.

ALTER TABLE "Cita" ADD COLUMN "clienteTelefono" TEXT;
ALTER TABLE "Cita" ADD COLUMN "clienteEmail" TEXT;
ALTER TABLE "Cita" ADD COLUMN "nota" TEXT;
ALTER TABLE "Cita" ADD COLUMN "extras" JSONB;
ALTER TABLE "Cita" ADD COLUMN "serviciosTexto" TEXT;
ALTER TABLE "Cita" ADD COLUMN "bufferMin" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Cita" ADD COLUMN "origen" TEXT NOT NULL DEFAULT 'panel';
ALTER TABLE "Cita" ADD COLUMN "visible" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "CitaServicio" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "citaId" TEXT NOT NULL,
  "servicioId" TEXT,
  "nombre" TEXT NOT NULL,
  "duracionMin" INTEGER NOT NULL,
  "precio" DECIMAL(10,2) NOT NULL,
  CONSTRAINT "CitaServicio_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CitaServicio_storeId_idx" ON "CitaServicio"("storeId");
CREATE INDEX "CitaServicio_citaId_idx" ON "CitaServicio"("citaId");

ALTER TABLE "CitaServicio" ADD CONSTRAINT "CitaServicio_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CitaServicio" ADD CONSTRAINT "CitaServicio_citaId_fkey"
  FOREIGN KEY ("citaId") REFERENCES "Cita"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CitaServicio" ADD CONSTRAINT "CitaServicio_servicioId_fkey"
  FOREIGN KEY ("servicioId") REFERENCES "ServicioAgenda"("id") ON DELETE SET NULL ON UPDATE CASCADE;
