-- Página pública de reservas de un negocio de turnos (salón, barbería…).
-- Una por local, totalmente aparte de la configuración base del negocio
-- (Store): su propio nombre, dirección web (/turnos/<slug>), contacto, redes,
-- galería, apariencia y campos del formulario. Aditiva pura: nada existente
-- cambia.

CREATE TABLE "PaginaReservas" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "habilitada" BOOLEAN NOT NULL DEFAULT false,
  "nombre" TEXT NOT NULL,
  "industria" TEXT,
  "descripcion" TEXT,
  "email" TEXT,
  "telefono" TEXT,
  "fotoUrl" TEXT,
  "bannerUrl" TEXT,
  "instagram" TEXT,
  "tiktok" TEXT,
  "facebook" TEXT,
  "whatsapp" TEXT,
  "avisoWhatsapp" BOOLEAN NOT NULL DEFAULT true,
  "entradaCalendario" TEXT NOT NULL DEFAULT 'al_reservar',
  "galeria" JSONB NOT NULL DEFAULT '[]',
  "colorPrimario" TEXT NOT NULL DEFAULT '#3B82F6',
  "tema" TEXT NOT NULL DEFAULT 'claro',
  "campos" JSONB NOT NULL DEFAULT '[]',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PaginaReservas_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PaginaReservas_storeId_key" ON "PaginaReservas"("storeId");
CREATE UNIQUE INDEX "PaginaReservas_slug_key" ON "PaginaReservas"("slug");

ALTER TABLE "PaginaReservas" ADD CONSTRAINT "PaginaReservas_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
